import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/storage/database/supabase-client";
import { requirePermission } from "@/lib/auth";

// GET - 查询晚自习安排和考勤
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'eveningStudy');
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const className = searchParams.get("class");
    const type = searchParams.get("type");

    // 查询今日安排
    if (type === "today") {
      const today = new Date().toISOString().split("T")[0];
      const data = await query(
        `SELECT * FROM evening_study_schedules WHERE date = $1 ORDER BY classroom`,
        [today]
      );
      return NextResponse.json({ success: true, data });
    }

    // 查询考勤记录
    if (type === "attendance") {
      if (className) {
        const data = await query(
          `SELECT * FROM evening_study_attendance WHERE class_name ILIKE $1 ORDER BY date DESC LIMIT 50`,
          [`%${className}%`]
        );
        return NextResponse.json({ success: true, data });
      }
      
      const data = await query(
        `SELECT * FROM evening_study_attendance ORDER BY date DESC LIMIT 50`
      );
      return NextResponse.json({ success: true, data });
    }

    // 查询安排
    if (date) {
      const data = await query(
        `SELECT * FROM evening_study_schedules WHERE date = $1 ORDER BY date DESC`,
        [date]
      );
      return NextResponse.json({ success: true, data });
    }
    
    if (className) {
      const data = await query(
        `SELECT * FROM evening_study_schedules WHERE class_name ILIKE $1 ORDER BY date DESC LIMIT 50`,
        [`%${className}%`]
      );
      return NextResponse.json({ success: true, data });
    }
    
    const data = await query(
      `SELECT * FROM evening_study_schedules ORDER BY date DESC LIMIT 50`
    );
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("查询晚自习失败:", error);
    return NextResponse.json({ success: false, error: "查询失败" }, { status: 500 });
  }
}

// POST - 创建晚自习安排或考勤记录
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'manageAttendanceWork');
    if (auth.response) return auth.response;
    const body = await request.json();
    const { type, ...data } = body;

    if (type === "attendance") {
      const result = await queryOne(
        `INSERT INTO evening_study_attendance (schedule_id, date, class_name, total_count, present_count, absent_count, discipline_status, notes, checker_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          data.schedule_id,
          data.date,
          data.class_name,
          data.total_count,
          data.present_count,
          data.absent_count || (data.total_count - data.present_count),
          data.discipline_status || "良好",
          data.notes,
          data.checker_name,
        ]
      );
      return NextResponse.json({ success: true, data: result });
    }

    const result = await queryOne(
      `INSERT INTO evening_study_schedules (date, weekday, class_name, classroom, checker_name, checker_phone, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [data.date, data.weekday, data.class_name, data.classroom, data.checker_name, data.checker_phone, data.notes]
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("创建晚自习记录失败:", error);
    return NextResponse.json({ success: false, error: "创建失败" }, { status: 500 });
  }
}

// PUT - 更新晚自习安排
export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'manageAttendanceWork');
    if (auth.response) return auth.response;
    const body = await request.json() as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "请求参数无效" }, { status: 400 });
    }

    const { id, ...data } = body as { id?: unknown } & Record<string, unknown>;
    if (typeof id !== 'string' || !id.trim()) {
      return NextResponse.json({ success: false, error: "缺少ID参数" }, { status: 400 });
    }

    const editableFields = new Set([
      'date',
      'weekday',
      'class_name',
      'classroom',
      'checker_name',
      'checker_phone',
      'notes',
    ]);
    const dataKeys = Object.keys(data);
    if (dataKeys.some((key) => !editableFields.has(key))) {
      return NextResponse.json({ success: false, error: "包含不可更新的字段" }, { status: 400 });
    }
    if (!dataKeys.length) {
      return NextResponse.json({ success: false, error: "没有可更新的内容" }, { status: 400 });
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const key of dataKeys) {
      const value = data[key];
      setClauses.push(`${key} = $${paramIndex++}`);
      params.push(value);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id.trim());

    const result = await queryOne(
      `UPDATE evening_study_schedules SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );
    if (!result) {
      return NextResponse.json({ success: false, error: "晚自习记录不存在" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("更新晚自习记录失败:", error);
    return NextResponse.json({ success: false, error: "更新失败" }, { status: 500 });
  }
}

// DELETE - 删除晚自习安排
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requirePermission(request, 'manageAttendanceWork');
    if (auth.response) return auth.response;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "缺少ID参数" }, { status: 400 });
    }

    await query(`DELETE FROM evening_study_schedules WHERE id = $1`, [id]);
    return NextResponse.json({ success: true, message: "删除成功" });
  } catch (error) {
    console.error("删除晚自习记录失败:", error);
    return NextResponse.json({ success: false, error: "删除失败" }, { status: 500 });
  }
}
