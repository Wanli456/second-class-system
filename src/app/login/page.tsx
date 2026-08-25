"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, Lock, LogIn, Hash } from "lucide-react";

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const redirect = requestedRedirect?.startsWith("/") && !requestedRedirect.startsWith("//") ? requestedRedirect : "/";
  
  const [loginStudentId, setLoginStudentId] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerStudentId, setRegisterStudentId] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerConfirm, setRegisterConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!loginStudentId || !loginName || !loginPassword) {
      setError("请输入学号、姓名和密码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          studentId: loginStudentId, 
          name: loginName, 
          password: loginPassword 
        }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("user", JSON.stringify(data.data));
        router.push(redirect);
      } else {
        setError(data.error || "登录失败");
      }
    } catch (err) {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerStudentId || !registerName || !registerPassword) {
      setError("请输入学号、姓名和密码");
      return;
    }
    if (registerPassword !== registerConfirm) {
      setError("两次密码不一致");
      return;
    }
    if (registerPassword.length < 6) {
      setError("密码至少6位");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: registerStudentId,
          name: registerName,
          password: registerPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("user", JSON.stringify(data.data));
        router.push(redirect);
      } else {
        setError(data.error || "注册失败");
      }
    } catch (err) {
      setError("注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <Card className="w-full max-w-md rounded-lg border-slate-200 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.45)]">
        <CardHeader className="space-y-3 pb-5 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white shadow-sm">
            <LogIn className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-2xl tracking-tight text-slate-950">账号登录</CardTitle>
            <CardDescription className="mt-2 text-slate-500">登录后可使用完整功能</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid h-10 w-full grid-cols-2 rounded-lg bg-slate-100 p-1">
              <TabsTrigger value="login">登录</TabsTrigger>
              <TabsTrigger value="register">注册</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login" className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">学号</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="请输入学号"
                    className="pl-10"
                    value={loginStudentId}
                    onChange={(e) => setLoginStudentId(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">姓名</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="请输入姓名"
                    className="pl-10"
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="password"
                    placeholder="请输入密码"
                    className="pl-10"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  />
                </div>
              </div>
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button className="w-full rounded-lg bg-teal-700 hover:bg-teal-800" onClick={handleLogin} disabled={loading}>
                <LogIn className="mr-2 h-4 w-4" />
                {loading ? "登录中..." : "登录"}
              </Button>
            </TabsContent>

            <TabsContent value="register" className="space-y-4">
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">注册后默认为学生身份，如需其他角色请联系管理员设置</p>
              <div className="space-y-2">
                <label className="text-sm font-medium">学号</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="请输入学号"
                    className="pl-10"
                    value={registerStudentId}
                    onChange={(e) => setRegisterStudentId(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">姓名</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="请输入姓名"
                    className="pl-10"
                    value={registerName}
                    onChange={(e) => setRegisterName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="password"
                    placeholder="请输入密码（至少6位）"
                    className="pl-10"
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">确认密码</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="password"
                    placeholder="请再次输入密码"
                    className="pl-10"
                    value={registerConfirm}
                    onChange={(e) => setRegisterConfirm(e.target.value)}
                  />
                </div>
              </div>
              {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <Button className="w-full rounded-lg bg-teal-700 hover:bg-teal-800" onClick={handleRegister} disabled={loading}>
                <User className="mr-2 h-4 w-4" />
                {loading ? "注册中..." : "注册"}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">加载中...</div>}>
      <LoginPageInner />
    </Suspense>
  );
}
