"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, Search, Calendar, Clock, MapPin, User, 
  BookOpen, ClipboardList, ChevronRight, RefreshCw
} from "lucide-react";

interface Schedule {
  id: string;
  date: string;
  weekday: string;
  class_name: string;
  classroom: string;
  checker_name: string | null;
  checker_phone: string | null;
  notes: string | null;
}

interface Attendance {
  id: string;
  schedule_id: string;
  date: string;
  class_name: string;
  total_count: number;
  present_count: number;
  absent_count: number;
  discipline_status: string;
  notes: string | null;
  checker_name: string;
}

const WEEKDAYS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const DISCIPLINE_COLORS: Record<string, string> = {
  "优秀": "bg-green-100 text-green-700 border-green-200",
  "良好": "bg-blue-100 text-blue-700 border-blue-200",
  "一般": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "较差": "bg-red-100 text-red-700 border-red-200",
};

export default function EveningStudyPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"today" | "search" | "attendance">("today");
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);
  const [searchResults, setSearchResults] = useState<Schedule[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [searchClass, setSearchClass] = useState("");
  const [attendanceClass, setAttendanceClass] = useState("");
  const [loading, setLoading] = useState(false);
  const [today, setToday] = useState("");

  useEffect(() => {
    const dateStr = new Date().toISOString().split("T")[0];
    setToday(dateStr);
    fetchTodaySchedules();
  }, []);

  const fetchTodaySchedules = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/evening-study?type=today");
      const data = await res.json();
      if (data.success) {
        setTodaySchedules(data.data);
      }
    } catch (error) {
      console.error("获取今日安排失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const searchSchedule = async () => {
    if (!searchClass.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/evening-study?type=schedule&class=${encodeURIComponent(searchClass)}`);
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.data);
      }
    } catch (error) {
      console.error("搜索失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendance = async () => {
    setLoading(true);
    try {
      const url = attendanceClass 
        ? `/api/evening-study?type=attendance&class=${encodeURIComponent(attendanceClass)}`
        : "/api/evening-study?type=attendance";
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setAttendanceRecords(data.data);
      }
    } catch (error) {
      console.error("获取考勤记录失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "attendance") {
      fetchAttendance();
    }
  }, [activeTab]);

  const getWeekday = (dateStr: string) => {
    const date = new Date(dateStr);
    return WEEKDAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f5f0] to-white pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-[#1e3a5f]">晚自习查询</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4 bg-gray-100 rounded-lg p-1">
          <button
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === "today" 
                ? "bg-white text-[#1e3a5f] shadow-sm" 
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("today")}
          >
            今日安排
          </button>
          <button
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === "search" 
                ? "bg-white text-[#1e3a5f] shadow-sm" 
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("search")}
          >
            班级查询
          </button>
          <button
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
              activeTab === "attendance" 
                ? "bg-white text-[#1e3a5f] shadow-sm" 
                : "text-gray-500 hover:text-gray-700"
            }`}
            onClick={() => setActiveTab("attendance")}
          >
            考勤记录
          </button>
        </div>

        {/* Today's Schedule */}
        {activeTab === "today" && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[#1e3a5f]">
                <Calendar className="h-4 w-4" />
                <span className="text-sm font-medium">{today} {getWeekday(today)}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={fetchTodaySchedules} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {todaySchedules.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-gray-500">
                  <BookOpen className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p>今日暂无晚自习安排</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {todaySchedules.map((schedule) => (
                  <Card key={schedule.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge className="bg-[#1e3a5f] text-white border-0">{schedule.class_name}</Badge>
                            <span className="text-xs text-gray-500">{schedule.weekday}</span>
                          </div>
                          <div className="space-y-1.5 text-sm">
                            <div className="flex items-center gap-2 text-gray-600">
                              <MapPin className="h-3.5 w-3.5 text-gray-400" />
                              <span>{schedule.classroom}</span>
                            </div>
                            {schedule.checker_name && (
                              <div className="flex items-center gap-2 text-gray-600">
                                <User className="h-3.5 w-3.5 text-gray-400" />
                                <span>检查: {schedule.checker_name}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <Clock className="h-5 w-5 text-gray-300" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Search by Class */}
        {activeTab === "search" && (
          <div>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="输入班级名称..."
                value={searchClass}
                onChange={(e) => setSearchClass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchSchedule()}
                className="flex-1"
              />
              <Button onClick={searchSchedule} disabled={loading}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {searchResults.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-gray-500">
                  <Search className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p>输入班级名称查询晚自习安排</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {searchResults.map((schedule) => (
                  <Card key={schedule.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className="bg-[#1e3a5f] text-white border-0">{schedule.class_name}</Badge>
                        <span className="text-sm text-gray-500">{formatDate(schedule.date)}</span>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin className="h-3.5 w-3.5 text-gray-400" />
                          <span>{schedule.classroom}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          <span>{schedule.weekday}</span>
                        </div>
                        {schedule.checker_name && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            <span>检查: {schedule.checker_name}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Attendance Records */}
        {activeTab === "attendance" && (
          <div>
            <div className="flex gap-2 mb-4">
              <Input
                placeholder="搜索班级..."
                value={attendanceClass}
                onChange={(e) => setAttendanceClass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchAttendance()}
                className="flex-1"
              />
              <Button onClick={fetchAttendance} disabled={loading}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {attendanceRecords.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-gray-500">
                  <ClipboardList className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p>暂无考勤记录</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {attendanceRecords.map((record) => (
                  <Card key={record.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-[#1e3a5f] text-white border-0">{record.class_name}</Badge>
                          <span className="text-xs text-gray-500">{formatDate(record.date)}</span>
                        </div>
                        <Badge className={DISCIPLINE_COLORS[record.discipline_status] || "bg-gray-100 text-gray-700 border-gray-200"}>
                          {record.discipline_status}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 mb-3 p-3 bg-gray-50 rounded-lg">
                        <div className="text-center">
                          <div className="text-lg font-bold text-[#1e3a5f]">{record.total_count}</div>
                          <div className="text-xs text-gray-500">应到</div>
                        </div>
                        <div className="text-center border-x border-gray-200">
                          <div className="text-lg font-bold text-green-600">{record.present_count}</div>
                          <div className="text-xs text-gray-500">实到</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-bold text-red-500">{record.absent_count}</div>
                          <div className="text-xs text-gray-500">缺勤</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>检查人: {record.checker_name}</span>
                        {record.notes && <span className="truncate ml-2">备注: {record.notes}</span>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
