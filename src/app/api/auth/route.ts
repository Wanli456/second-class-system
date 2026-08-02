import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/storage/database/supabase-client';
import {
  clearSessionCookie,
  hashPassword,
  publicUser,
  requirePermission,
  requireUser,
  setSessionCookie,
  verifyPassword,
} from '@/lib/auth';

// POST /api/auth - register
export async function POST(request: NextRequest) {
  try {
    const { studentId, name, password } = await request.json();
    if (!studentId || !name || !password) {
      return NextResponse.json({ success: false, error: 'Student ID, name and password are required' }, { status: 400 });
    }
    if (String(password).length < 6) {
      return NextResponse.json({ success: false, error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const existing = await queryOne('SELECT id FROM users WHERE student_id = $1', [studentId]);
    if (existing) {
      return NextResponse.json({ success: false, error: 'This student ID is already registered' }, { status: 400 });
    }

    const user = await queryOne(
      `INSERT INTO users (username, password, student_id, role, can_publish, can_score, can_review_leave)
       VALUES ($1, $2, $3, 'student', false, false, false)
       RETURNING id, username, student_id, role, can_publish, can_score, can_submit_scoring, can_review_leave, can_view_evening_study`,
      [name, await hashPassword(password), studentId],
    );

    const response = NextResponse.json({ success: true, data: publicUser(user) });
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    console.error('Registration failed:', error);
    return NextResponse.json({ success: false, error: 'Registration failed' }, { status: 500 });
  }
}

// PUT /api/auth - login
export async function PUT(request: NextRequest) {
  try {
    const { studentId, name, password } = await request.json();
    if (!studentId || !name || !password) {
      return NextResponse.json({ success: false, error: 'Student ID, name and password are required' }, { status: 400 });
    }

    const user = await queryOne('SELECT * FROM users WHERE student_id = $1 AND username = $2', [studentId, name]);
    if (!user || !(await verifyPassword(password, user.password))) {
      return NextResponse.json({ success: false, error: 'Invalid student ID, name or password' }, { status: 401 });
    }

    // Upgrade old plaintext records after a successful login.
    if (!user.password.startsWith('scrypt$')) {
      await query('UPDATE users SET password = $1 WHERE id = $2', [await hashPassword(password), user.id]);
    }

    const response = NextResponse.json({ success: true, data: publicUser(user) });
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    console.error('Login failed:', error);
    return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
  }
}

// GET /api/auth - admin user list
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;

    const userList = await query('SELECT * FROM users ORDER BY created_at DESC');
    return NextResponse.json({
      success: true,
      data: userList.map((user) => ({
        id: user.id,
        studentId: user.student_id,
        name: user.username,
        role: user.role,
        canPublish: user.can_publish,
        canScore: user.can_score,
        canSubmitScoring: user.can_submit_scoring,
        canReviewLeave: user.can_review_leave,
        canViewEveningStudy: user.can_view_evening_study,
      })),
    });
  } catch (error) {
    console.error('Failed to list users:', error);
    return NextResponse.json({ success: false, error: 'Failed to list users' }, { status: 500 });
  }
}

// PATCH /api/auth - admin permissions or own password
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.password && body.oldPassword) {
      const auth = await requireUser(request);
      if (auth.response) return auth.response;
      if (auth.user!.id !== body.id) {
        return NextResponse.json({ success: false, error: 'You can only change your own password' }, { status: 403 });
      }
      const current = await queryOne('SELECT password FROM users WHERE id = $1', [body.id]);
      if (!current || !(await verifyPassword(body.oldPassword, current.password))) {
        return NextResponse.json({ success: false, error: 'Old password is incorrect' }, { status: 400 });
      }
      await query('UPDATE users SET password = $1 WHERE id = $2', [await hashPassword(body.password), body.id]);
      return NextResponse.json({ success: true });
    }

    const auth = await requirePermission(request, 'admin');
    if (auth.response) return auth.response;
    const { userId, role, canPublish, canScore, canSubmitScoring, canReviewLeave, canViewEveningStudy } = body;
    if (!userId) return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 });

    const updates: string[] = [];
    const params: unknown[] = [];
    let index = 1;
    if (role !== undefined) { updates.push(`role = $${index++}`); params.push(role); }
    if (canPublish !== undefined) { updates.push(`can_publish = $${index++}`); params.push(canPublish); }
    if (canScore !== undefined) { updates.push(`can_score = $${index++}`); params.push(canScore); }
    if (canSubmitScoring !== undefined) { updates.push(`can_submit_scoring = $${index++}`); params.push(canSubmitScoring); }
    if (canReviewLeave !== undefined) { updates.push(`can_review_leave = $${index++}`); params.push(canReviewLeave); }
    if (canViewEveningStudy !== undefined) { updates.push(`can_view_evening_study = $${index++}`); params.push(canViewEveningStudy); }
    if (!updates.length) return NextResponse.json({ success: false, error: 'No fields to update' }, { status: 400 });

    params.push(userId);
    const user = await queryOne(`UPDATE users SET ${updates.join(', ')} WHERE id = $${index} RETURNING *`, params);
    if (!user) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: publicUser(user) });
  } catch (error) {
    console.error('Failed to update user:', error);
    return NextResponse.json({ success: false, error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
