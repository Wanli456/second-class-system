"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, Search, Calendar, User, Users, FileText,
  AlertCircle, CheckCircle2, XCircle, Clock, RefreshCw, GraduationCap
} from "lucide-react";

interface LeaveRequest {
  id: string;
  student_id: string;
  class_name: string;
  student_name: string;
  leave_type: string;
  leave_image_url: string | null;
  activity_name: string | null;
  review_status: string;
  review_note: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  "待审核": "bg-amber-50 text-amber-700 border-amber-200",
  "已通过": "bg-green-50 text-green-700 border-green-200",
  "已驳回": "bg-red-50 text-red-700 border-red-200",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  "待审核": <Clock className="h-3 w-3" />,
  "已通过": <CheckCircle2 className="h-3 w-3" />,
  "已驳回": <XCircle className="h-3 w-3" />,
};

const LEAVE_TYPE_COLORS: Record<string, string> = {
  "事假": "bg-blue-50 text-blue-700 border-blue-200",
  "病假": "bg-orange-50 text-orange-700 border-orange-200",
  "活动公假": "bg-purple-50 text-purple-700 border-purple-200",
};

type SearchType = "class" | "name" | "student_id";

export default function EveningStudyPage() {
  const router = useRouter();
  const [searchKeyword, setSearchKeyword] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("class");
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [today, setToday] = useState("");

  useEffect(() => {
    const dateStr = new Date().toISOString().split("T")[0];
    setToday(dateStr);
  }, []);

  const fetchLeaveRequests = async () => {
    if (!searchKeyword.trim()) {
      alert("请输入查询内容");
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (searchType === "class") {
        params.set("class", searchKeyword.trim());
      } else if (searchType === "name") {
        params.set("name", searchKeyword.trim());
      } else {
        params.set("student_id", searchKeyword.trim());
      }
      const res = await fetch(`/api/leave?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLeaveRequests(data.data);
      } else {
        alert(data.error || "查询失败");
      }
    } catch (error) {
      console.error("查询失败:", error);
      alert("查询失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      fetchLeaveRequests();
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  };

  // 按班级分组统计
  const getClassStats = () => {
    const stats: Record<string, number> = {};
    leaveRequests.forEach(req => {
      stats[req.class_name] = (stats[req.class_name] || 0) + 1;
    });
    return stats;
  };

  const classStats = getClassStats();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f5f0] to-white pb-20">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-[#1e3a5f]">晚自习请假查询</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-4">
        <Card className="mb-4 border-[#1e3a5f]/10">
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Search className="h-4 w-4 text-[#1e3a5f]" />
              <span className="text-sm font-medium text-[#1e3a5f]">查询请假人员</span>
            </div>
            
            {/* 查询类型选择 */}
            <div className="flex gap-2 mb-3">
              <Button
                variant={searchType === "class" ? "default" : "outline"}
                size="sm"
                onClick={() => setSearchType("class")}
                className={searchType === "class" ? "bg-[#1e3a5f] hover:bg-[#152a45]" : ""}
              >
                <Users className="h-3 w-3 mr-1" />
                班级
              </Button>
              <Button
                variant={searchType === "name" ? "default" : "outline"}
                size="sm"
                onClick={() => setSearchType("name")}
                className={searchType === "name" ? "bg-[#1e3a5f] hover:bg-[#152a45]" : ""}
              >
                <User className="h-3 w-3 mr-1" />
                姓名
              </Button>
              <Button
                variant={searchType === "student_id" ? "default" : "outline"}
                size="sm"
                onClick={() => setSearchType("student_id")}
                className={searchType === "student_id" ? "bg-[#1e3a5f] hover:bg-[#152a45]" : ""}
              >
                <GraduationCap className="h-3 w-3 mr-1" />
                学号
              </Button>
            </div>

            {/* 搜索框 */}
            <div className="flex gap-2">
              <Input
                placeholder={
                  searchType === "class" 
                    ? "输入班级名称，如：计算机2101" 
                    : searchType === "name"
                    ? "输入学生姓名"
                    : "输入学生学号"
                }
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
              />
              <Button 
                onClick={fetchLeaveRequests} 
                disabled={loading}
                className="bg-[#1e3a5f] hover:bg-[#152a45]"
              >
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {searched && (
          <>
            {leaveRequests.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center text-gray-500">
                  <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                  <p>暂无请假记录</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {/* 班级统计 */}
                {searchType === "class" && Object.keys(classStats).length > 0 && (
                  <Card className="bg-gradient-to-r from-[#1e3a5f]/5 to-[#1e3a5f]/10 border-[#1e3a5f]/20">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-[#1e3a5f]" />
                          <span className="text-sm font-medium text-[#1e3a5f]">班级请假统计</span>
                        </div>
                        <div className="flex items-center gap-4">
                          {Object.entries(classStats).map(([className, count]) => (
                            <div key={className} className="text-center">
                              <div className="text-lg font-bold text-[#1e3a5f]">{count}</div>
                              <div className="text-xs text-gray-500">{className}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                  <Calendar className="h-4 w-4" />
                  <span>查询日期：{today}</span>
                  <span className="ml-auto">共 {leaveRequests.length} 条记录</span>
                </div>

                {leaveRequests.map((req) => (
                  <Card key={req.id} className="overflow-hidden">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-[#1e3a5f]" />
                            <span className="font-medium text-[#1e3a5f]">{req.student_name}</span>
                            <Badge variant="outline" className="text-xs">
                              {req.student_id}
                            </Badge>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {req.class_name} · 提交于 {formatDate(req.created_at)}
                          </div>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`${STATUS_COLORS[req.review_status]} flex items-center gap-1`}
                        >
                          {STATUS_ICONS[req.review_status]}
                          {req.review_status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-500">请假类型：</span>
                        <Badge variant="outline" className={LEAVE_TYPE_COLORS[req.leave_type]}>
                          {req.leave_type}
                        </Badge>
                      </div>

                      {req.activity_name && (
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs text-gray-500">关联活动：</span>
                          <span className="text-sm text-[#1e3a5f]">{req.activity_name}</span>
                        </div>
                      )}

                      {req.leave_image_url && (
                        <div className="mt-3">
                          <span className="text-xs text-gray-500 block mb-2">请假条截图：</span>
                          <a 
                            href={req.leave_image_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <img 
                              src={req.leave_image_url} 
                              alt="请假条" 
                              className="w-full max-h-48 object-cover rounded-lg border border-gray-200 hover:border-[#1e3a5f] transition-colors"
                            />
                          </a>
                        </div>
                      )}

                      {req.review_note && (
                        <div className="mt-3 p-2 bg-gray-50 rounded-lg">
                          <div className="flex items-start gap-1">
                            <AlertCircle className="h-3 w-3 text-gray-400 mt-0.5 shrink-0" />
                            <span className="text-xs text-gray-600">{req.review_note}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {!searched && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">输入班级、姓名或学号查询请假人员</p>
              <p className="text-xs mt-1 text-gray-400">可查看请假申请及审核状态</p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
