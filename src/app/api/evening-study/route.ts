import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET - 查询晚自习安排和考勤
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const className = searchParams.get("class");
  const type = searchParams.get("type"); // schedule | attendance | today

  try {
    const client = getSupabaseClient();

    // 查询今日安排
    if (type === "today") {
      const today = new Date().toISOString().split("T")[0];
      const { data, error } = await client
        .from("evening_study_schedules")
        .select("*")
        .eq("date", today)
        .order("classroom");
      
      if (error) throw error;
      return NextResponse.json({ success: true, data: data || [] });
    }

    // 查询考勤记录
    if (type === "attendance") {
      let query = client
        .from("evening_study_attendance")
        .select("*")
        .order("date", { ascending: false })
        .limit(50);
      
      if (className) {
        const { data, error } = await query.ilike("class_name", `%${className}%`);
        if (error) throw error;
        return NextResponse.json({ success: true, data: data || [] });
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ success: true, data: data || [] });
    }

    // 查询安排
    let query = client
      .from("evening_study_schedules")
      .select("*")
      .order("date", { ascending: false });
    
    if (date) {
      const { data, error } = await query.eq("date", date);
      if (error) throw error;
      return NextResponse.json({ success: true, data: data || [] });
    }
    
    if (className) {
      const { data, error } = await query.ilike("class_name", `%${className}%`).limit(50);
      if (error) throw error;
      return NextResponse.json({ success: true, data: data || [] });
    }
    
    const { data, error } = await query.limit(50);
    if (error) throw error;
    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error("查询晚自习失败:", error);
    return NextResponse.json({ success: false, error: "查询失败" }, { status: 500 });
  }
}

// POST - 创建晚自习安排或考勤记录
export async function POST(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { type, ...data } = body;

    if (type === "attendance") {
      // 创建考勤记录
      const { data: result, error } = await client
        .from("evening_study_attendance")
        .insert({
          schedule_id: data.schedule_id,
          date: data.date,
          class_name: data.class_name,
          total_count: data.total_count,
          present_count: data.present_count,
          absent_count: data.absent_count || (data.total_count - data.present_count),
          discipline_status: data.discipline_status || "良好",
          notes: data.notes,
          checker_name: data.checker_name,
        })
        .select()
        .single();
      
      if (error) throw error;
      return NextResponse.json({ success: true, data: result });
    }

    // 创建安排
    const { data: result, error } = await client
      .from("evening_study_schedules")
      .insert({
        date: data.date,
        weekday: data.weekday,
        class_name: data.class_name,
        classroom: data.classroom,
        checker_name: data.checker_name,
        checker_phone: data.checker_phone,
        notes: data.notes,
      })
      .select()
      .single();
    
    if (error) throw error;
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("创建晚自习记录失败:", error);
    return NextResponse.json({ success: false, error: "创建失败" }, { status: 500 });
  }
}

// PUT - 更新晚自习安排
export async function PUT(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const body = await request.json();
    const { id, ...data } = body;

    const { data: result, error } = await client
      .from("evening_study_schedules")
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) throw error;
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("更新晚自习记录失败:", error);
    return NextResponse.json({ success: false, error: "更新失败" }, { status: 500 });
  }
}

// DELETE - 删除晚自习安排
export async function DELETE(request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "缺少ID参数" }, { status: 400 });
    }

    const { error } = await client
      .from("evening_study_schedules")
      .delete()
      .eq("id", id);
    
    if (error) throw error;
    return NextResponse.json({ success: true, message: "删除成功" });
  } catch (error) {
    console.error("删除晚自习记录失败:", error);
    return NextResponse.json({ success: false, error: "删除失败" }, { status: 500 });
  }
}
