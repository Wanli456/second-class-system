# AGENTS.md

## 项目概览

二课活动管理系统 - 第二课堂活动管理、请假申请、活动赋分、晚自习请假查询的全栈 Web 系统。

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19 + TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage (app-files bucket)

## 核心功能

### 1. 活动管理
- 活动总表（管理员 CRUD）
- 活动提交（负责人提交 → 审核 → 自动写入总表）
- 活动ID格式：`EK{YYYYMM}{序号}`，系统自动生成，不可修改
- 负责人可上传活动策划书（电子档）和备案表（电子档）
- 赋分材料（赋分表+备案表照片）通过独立入口提交

### 2. 请假管理
- 学生提交请假（事假/病假/活动公假）
- 活动公假自动校验活动是否存在，不存在则自动驳回
- 管理员审核请假申请，可查看请假条截图

### 3. 活动赋分
- 赋分干事对活动进行赋分操作
- 院系级活动：仅需赋分表
- 校级活动：需要备案表照片 + 赋分表
- 赋分完成后通知负责人

### 4. 晚自习请假查询
- 支持按班级、姓名、学号查询请假记录
- 按班级查询时显示请假人数统计

### 5. 用户系统
- 注册/登录功能
- 登录后跳转二课活动管理系统

## 角色与权限

| 角色 | 可见功能 |
|------|----------|
| 管理员 | 活动总表 + 活动审核 + 请假审核 + 活动赋分 |
| 发布干事 | 活动审核（含策划书/备案表查看下载） |
| 赋分干事 | 活动赋分（查看赋分表/备案表照片，确认赋分） |
| 活动负责人 | 提交活动、查看提交状态、提交赋分材料（需登录） |
| 学生/访客 | 提交请假、查看请假状态、晚自习请假查询（无需登录） |

## 目录结构

```
src/
├── app/
│   ├── api/
│   │   ├── activities/route.ts      # 活动总表 CRUD
│   │   ├── activities/submit/route.ts # 活动提交
│   │   ├── activities/review/route.ts # 活动审核
│   │   ├── leave/route.ts           # 请假管理
│   │   ├── scoring/route.ts         # 活动赋分
│   │   ├── auth/route.ts            # 用户认证
│   │   ├── upload/route.ts          # 文件上传
│   │   └── evening-study/route.ts   # 晚自习查询
│   ├── admin/page.tsx               # 管理后台（多角色）
│   ├── submit/page.tsx              # 活动提交页
│   ├── submit/status/page.tsx       # 提交状态查询
│   ├── submit/scoring/page.tsx      # 赋分材料提交
│   ├── leave/page.tsx               # 请假申请页
│   ├── leave/status/page.tsx        # 请假状态查询
│   ├── evening-study/page.tsx       # 晚自习请假查询
│   ├── login/page.tsx               # 登录/注册页
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
| /api/activities | GET | 获取活动列表（支持筛选、关键字搜索） |
| /api/activities | POST | 管理员创建活动 |
| /api/activities | PUT | 管理员更新活动 |
| /api/activities | DELETE | 管理员删除活动 |
| /api/activities/submit | GET | 负责人查询提交（?phone=） |
| /api/activities/submit | POST | 负责人提交活动 |
| /api/activities/review | GET | 管理员获取提交列表 |
| /api/activities/review | PUT | 管理员审核提交 |
| /api/leave | GET | 查询请假（?student_id= / ?class= / ?name= / ?role=admin） |
| /api/leave | POST | 学生提交请假 |
| /api/leave | PUT | 管理员审核请假 |
| /api/scoring | GET | 获取赋分列表 |
| /api/scoring | PUT | 执行赋分操作 |
| /api/auth | POST | 用户注册 |
| /api/auth | PUT | 用户登录 |
| /api/upload | POST | 文件上传（FormData） |
| /api/evening-study | GET | 晚自习请假查询 |

## 数据库表

- **activities** - 活动总表（含赋分状态）
- **activity_submissions** - 活动提交记录
- **leave_requests** - 请假申请
- **users** - 用户表
- **evening_study_schedules** - 晚自习安排表
- **evening_study_attendance** - 晚自习考勤记录表
