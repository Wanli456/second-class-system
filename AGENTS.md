# AGENTS.md

## 项目概览

二课活动管理系统 - 第二课堂活动管理与请假申请的全栈 Web 系统。

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19 + TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (app-files bucket)

## 核心功能

### 1. 活动管理
- 活动总表（管理员 CRUD）
- 活动提交（负责人提交 → 管理员审核 → 自动写入总表）
- 活动ID格式：`EK{YYYYMM}{序号}`，系统自动生成，不可修改

### 2. 请假管理
- 学生提交请假（事假/病假/活动公假）
- 活动公假自动校验活动是否存在，不存在则自动驳回
- 管理员审核请假申请

## 目录结构

```
src/
├── app/
│   ├── api/
│   │   ├── activities/route.ts      # 活动总表 CRUD
│   │   ├── activities/submit/route.ts # 活动提交
│   │   ├── activities/review/route.ts # 活动审核
│   │   ├── leave/route.ts           # 请假管理
│   │   └── upload/route.ts          # 文件上传
│   ├── admin/page.tsx               # 管理后台
│   ├── submit/page.tsx              # 活动提交页
│   ├── submit/status/page.tsx       # 提交状态查询
│   ├── leave/page.tsx               # 请假申请页
│   ├── leave/status/page.tsx        # 请假状态查询
│   ├── layout.tsx
│   └── page.tsx                     # 首页（角色入口）
├── components/ui/                   # shadcn/ui 组件
├── lib/types.ts                     # 类型定义与常量
└── storage/database/
    ├── supabase-client.ts           # Supabase 客户端
    └── shared/schema.ts             # 数据库 Schema
```

## API 接口

| 路径 | 方法 | 说明 |
|------|------|------|
| /api/activities | GET | 获取活动列表（支持筛选） |
| /api/activities | POST | 管理员创建活动 |
| /api/activities | PUT | 管理员更新活动 |
| /api/activities | DELETE | 管理员删除活动 |
| /api/activities/submit | GET | 负责人查询提交（?phone=） |
| /api/activities/submit | POST | 负责人提交活动 |
| /api/activities/review | GET | 管理员获取提交列表 |
| /api/activities/review | PUT | 管理员审核提交 |
| /api/leave | GET | 查询请假（?student_id= 或 ?role=admin） |
| /api/leave | POST | 学生提交请假 |
| /api/leave | PUT | 管理员审核请假 |
| /api/upload | POST | 文件上传（FormData） |

## 数据库表

- **activities** - 活动总表
- **activity_submissions** - 活动提交记录
- **leave_requests** - 请假申请

## 角色说明

- **管理员**：密码 admin123，管理活动总表、审核提交和请假
- **活动负责人**：通过手机号查询提交状态
- **学生**：通过学号查询请假状态
