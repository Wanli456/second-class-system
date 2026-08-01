#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, ListFlowable, ListItem
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import os

# 尝试注册中文字体
font_paths = [
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc',
    '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
]

font_registered = False
for font_path in font_paths:
    if os.path.exists(font_path):
        try:
            pdfmetrics.registerFont(TTFont('Chinese', font_path))
            font_registered = True
            print(f'使用字体：{font_path}')
            break
        except:
            continue

if not font_registered:
    print('未找到中文字体，使用默认字体（中文可能显示为方块）')

def create_pdf():
    doc = SimpleDocTemplate(
        '/workspace/projects/二课活动管理系统使用说明书.pdf',
        pagesize=A4,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=18
    )
    
    styles = getSampleStyleSheet()
    
    # 创建样式
    if font_registered:
        title_style = ParagraphStyle(
            'ChineseTitle',
            parent=styles['Heading1'],
            fontName='Chinese',
            fontSize=18,
            alignment=TA_CENTER,
            spaceAfter=30
        )
        heading1_style = ParagraphStyle(
            'ChineseHeading1',
            parent=styles['Heading1'],
            fontName='Chinese',
            fontSize=14,
            spaceBefore=20,
            spaceAfter=10
        )
        heading2_style = ParagraphStyle(
            'ChineseHeading2',
            parent=styles['Heading2'],
            fontName='Chinese',
            fontSize=12,
            spaceBefore=15,
            spaceAfter=8
        )
        heading3_style = ParagraphStyle(
            'ChineseHeading3',
            parent=styles['Heading3'],
            fontName='Chinese',
            fontSize=11,
            spaceBefore=10,
            spaceAfter=6
        )
        normal_style = ParagraphStyle(
            'ChineseNormal',
            parent=styles['Normal'],
            fontName='Chinese',
            fontSize=10,
            spaceAfter=6
        )
    else:
        title_style = styles['Heading1']
        heading1_style = styles['Heading1']
        heading2_style = styles['Heading2']
        heading3_style = styles['Heading3']
        normal_style = styles['Normal']
    
    story = []
    
    # 标题
    story.append(Paragraph('二课活动管理系统 - 使用说明书', title_style))
    story.append(Spacer(1*inch, 0.5*inch))
    
    # 目录
    story.append(Paragraph('目录', heading1_style))
    toc_items = [
        '系统简介',
        '学生使用指南',
        '活动负责人使用指南',
        '发布干事使用指南',
        '赋分干事使用指南',
        '管理员使用指南',
        '常见问题'
    ]
    for i, item in enumerate(toc_items, 1):
        story.append(Paragraph(f'{i}. {item}', normal_style))
    
    story.append(PageBreak())
    
    # 系统简介
    story.append(Paragraph('系统简介', heading1_style))
    story.append(Paragraph('二课活动管理系统是一个用于管理第二课堂活动的平台，主要功能包括：', normal_style))
    features = [
        '活动管理：发布、审核、管理各类第二课堂活动',
        '请假管理：学生提交请假申请，管理员审核',
        '活动赋分：对完成的活动进行学分赋分',
        '晚自习查询：查询晚自习请假记录'
    ]
    for feature in features:
        story.append(Paragraph(f'• {feature}', normal_style))
    
    story.append(Spacer(0.3*inch, 0))
    story.append(Paragraph('访问地址', heading2_style))
    story.append(Paragraph('系统网址：https://cf6e37ac-76fa-4ad2-b5a2-4ac4699268b4-5000.dev.coze.site', normal_style))
    story.append(Paragraph('⚠️ 注意：如果网址无法访问，可能是系统休眠了。请联系管理员唤醒系统，或等待几分钟后重试。', normal_style))
    
    story.append(PageBreak())
    
    # 学生使用指南
    story.append(Paragraph('学生使用指南', heading1_style))
    story.append(Paragraph('适用对象', heading2_style))
    story.append(Paragraph('所有在校学生（无需注册账号）', normal_style))
    
    story.append(Paragraph('功能一：提交请假申请', heading2_style))
    story.append(Paragraph('使用场景：因事假、病假或参加公共活动需要请假时', normal_style))
    story.append(Paragraph('操作步骤：', normal_style))
    steps = [
        '打开系统首页',
        '点击「请假申请」卡片',
        '填写请假信息：学号、班级、姓名、请假类型、请假条图片（必填）、活动名称（活动公假时填写）',
        '点击「提交请假」',
        '提交成功后，可以查询请假状态'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('查询请假状态', heading3_style))
    steps = [
        '点击首页「请假状态查询」',
        '输入学号或姓名',
        '查看审核状态（待审核 / 已通过 / 已驳回）'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能二：晚自习请假查询', heading2_style))
    story.append(Paragraph('使用场景：查询晚自习请假记录', normal_style))
    story.append(Paragraph('操作步骤：', normal_style))
    steps = [
        '点击首页「晚自习请假查询」',
        '选择查询方式：按班级查询、按姓名查询、按学号查询',
        '查看查询结果'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(PageBreak())
    
    # 活动负责人使用指南
    story.append(Paragraph('活动负责人使用指南', heading1_style))
    story.append(Paragraph('适用对象', heading2_style))
    story.append(Paragraph('负责组织和申报活动的学生（需要注册账号）', normal_style))
    
    story.append(Paragraph('第一步：注册账号', heading2_style))
    steps = [
        '打开系统首页',
        '点击右上角「登录/注册」',
        '点击「去注册」',
        '填写信息：学号、姓名、密码、角色（选择「负责人」）',
        '点击「注册」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('第二步：登录系统', heading2_style))
    steps = [
        '点击首页「登录/注册」',
        '输入学号、姓名、密码',
        '点击「登录」',
        '登录成功后，首页会显示你的姓名和角色'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能一：提交活动', heading2_style))
    story.append(Paragraph('使用场景：组织活动后，向学校申报活动信息', normal_style))
    story.append(Paragraph('操作步骤：', normal_style))
    steps = [
        '登录后，点击首页「活动提交」',
        '填写活动信息：活动名称、活动类别（德/智/体/美/劳）、活动级别（院系级/校级）、开始时间、结束时间、负责人姓名、负责人电话',
        '点击「提交活动」',
        '提交成功后，可以查询提交状态'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('查询提交状态', heading3_style))
    steps = [
        '点击首页「提交状态查询」',
        '输入负责人手机号',
        '查看审核状态'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能二：提交赋分材料', heading2_style))
    story.append(Paragraph('使用场景：活动结束后，提交赋分所需的材料', normal_style))
    story.append(Paragraph('操作步骤：', normal_style))
    steps = [
        '点击首页「赋分材料提交」',
        '输入负责人手机号查询已提交的活动',
        '选择要提交材料的活动',
        '上传材料：赋分表（必填）、备案表照片（校级活动需要）',
        '点击「提交材料」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能三：修改密码', heading2_style))
    steps = [
        '登录后，点击右上角你的姓名',
        '点击「修改密码」',
        '输入旧密码和新密码',
        '点击「确认修改」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(PageBreak())
    
    # 发布干事使用指南
    story.append(Paragraph('发布干事使用指南', heading1_style))
    story.append(Paragraph('适用对象', heading2_style))
    story.append(Paragraph('负责审核活动发布的干事（需要管理员赋予权限）', normal_style))
    
    story.append(Paragraph('登录系统', heading2_style))
    steps = [
        '使用分配的账号登录（学号 + 姓名 + 密码）',
        '登录后，点击首页「发布活动」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能：审核活动提交', heading2_style))
    story.append(Paragraph('操作步骤：', normal_style))
    steps = [
        '进入「发布活动」页面',
        '查看待审核的活动列表',
        '点击活动查看详细信息：活动基本信息、策划书（可下载查看）、备案表（可下载查看）',
        '选择审核结果：通过（活动审核通过，自动写入活动总表）或驳回（填写驳回原因，通知负责人）',
        '点击「确认」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(PageBreak())
    
    # 赋分干事使用指南
    story.append(Paragraph('赋分干事使用指南', heading1_style))
    story.append(Paragraph('适用对象', heading2_style))
    story.append(Paragraph('负责对活动进行赋分的干事（需要管理员赋予权限）', normal_style))
    
    story.append(Paragraph('登录系统', heading2_style))
    steps = [
        '使用分配的账号登录',
        '登录后，点击首页「活动赋分」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能：活动赋分', heading2_style))
    story.append(Paragraph('操作步骤：', normal_style))
    steps = [
        '进入「活动赋分」页面',
        '查看待赋分的活动列表',
        '点击活动查看详细信息：活动基本信息、赋分表（可下载查看）、备案表照片（校级活动，可下载查看）',
        '确认赋分材料无误后，点击「确认赋分」',
        '赋分完成后，系统会自动通知活动负责人'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('赋分规则', heading3_style))
    story.append(Paragraph('院系级活动：只需审核赋分表', normal_style))
    story.append(Paragraph('校级活动：需要审核赋分表 + 备案表照片', normal_style))
    
    story.append(PageBreak())
    
    # 管理员使用指南
    story.append(Paragraph('管理员使用指南', heading1_style))
    story.append(Paragraph('适用对象', heading2_style))
    story.append(Paragraph('系统管理员（拥有全部权限）', normal_style))
    
    story.append(Paragraph('登录系统', heading2_style))
    steps = [
        '使用管理员账号登录',
        '登录后，点击首页「管理员」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能一：活动总表管理', heading2_style))
    story.append(Paragraph('查看活动列表', heading3_style))
    steps = [
        '进入管理后台，默认显示「活动总表」',
        '可以按类别、级别筛选活动',
        '可以搜索活动名称'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('添加活动', heading3_style))
    steps = [
        '点击「添加活动」',
        '填写活动信息',
        '点击「确认添加」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('编辑活动', heading3_style))
    steps = [
        '点击活动右侧的「编辑」按钮',
        '修改活动信息',
        '点击「确认修改」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('删除活动', heading3_style))
    steps = [
        '点击活动右侧的「删除」按钮',
        '确认删除'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能二：活动审核', heading2_style))
    steps = [
        '点击「活动审核」标签',
        '查看负责人提交的活动',
        '审核通过或驳回'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能三：请假审核', heading2_style))
    steps = [
        '点击「请假审核」标签',
        '查看学生提交的请假申请',
        '查看请假条截图',
        '审核通过或驳回'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能四：活动赋分', heading2_style))
    steps = [
        '点击「活动赋分」标签',
        '对待赋分的活动进行赋分操作'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('功能五：用户管理', heading2_style))
    story.append(Paragraph('查看用户列表', heading3_style))
    steps = [
        '点击「用户管理」标签',
        '查看所有注册用户'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('修改用户权限', heading3_style))
    steps = [
        '找到要修改的用户',
        '点击「角色」下拉框，修改角色（学生/负责人/管理员）',
        '开启/关闭「发布活动权限」',
        '开启/关闭「活动赋分权限」',
        '开启/关闭「请假审核权限」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(Paragraph('添加用户', heading3_style))
    steps = [
        '点击「添加用户」',
        '填写用户信息',
        '点击「确认添加」'
    ]
    for i, step in enumerate(steps, 1):
        story.append(Paragraph(f'{i}. {step}', normal_style))
    
    story.append(PageBreak())
    
    # 常见问题
    story.append(Paragraph('常见问题', heading1_style))
    
    faqs = [
        ('Q1：网址打不开怎么办？', '原因：系统可能进入休眠状态\n解决方法：1. 等待 1-2 分钟后刷新页面 2. 联系管理员唤醒系统 3. 如果持续无法访问，可能是网络问题，稍后再试'),
        ('Q2：忘记密码怎么办？', '解决方法：1. 联系管理员重置密码 2. 或者重新注册一个新账号'),
        ('Q3：提交活动后多久能审核？', '审核时间由发布干事决定，一般 1-3 个工作日内完成审核'),
        ('Q4：请假申请被驳回了怎么办？', '1. 查看驳回原因 2. 修改后重新提交 3. 如有疑问，联系管理员'),
        ('Q5：如何知道我的活动是否赋分完成？', '1. 登录系统后，查看首页右上角的通知铃铛 2. 如果有新通知，铃铛上会显示红色数字 3. 点击铃铛查看通知详情'),
        ('Q6：活动 ID 是什么？', '活动 ID 格式：EK{年月}{序号}（如：EK202607001）\n活动 ID 由系统自动生成，不可修改\n用于唯一标识每个活动'),
        ('Q7：上传文件大小有限制吗？', '单个文件最大 10MB\n支持格式：图片（JPG、PNG）、PDF、Word 文档'),
        ('Q8：为什么我看不到某些功能入口？', '部分功能需要登录才能使用\n部分功能需要特定权限（如发布干事、赋分干事）\n联系管理员开通相应权限')
    ]
    
    for question, answer in faqs:
        story.append(Paragraph(question, heading2_style))
        story.append(Paragraph(answer, normal_style))
    
    story.append(PageBreak())
    
    # 联系支持
    story.append(Paragraph('联系支持', heading1_style))
    story.append(Paragraph('如有其他问题，请联系系统管理员：', normal_style))
    story.append(Paragraph('管理员姓名：李广', normal_style))
    story.append(Paragraph('学号：2505141139', normal_style))
    
    story.append(Spacer(1*inch, 0.5*inch))
    story.append(Paragraph('最后更新：2026 年 8 月', normal_style))
    
    # 生成 PDF
    doc.build(story)
    print('PDF 文档已生成：/workspace/projects/二课活动管理系统使用说明书.pdf')

if __name__ == '__main__':
    create_pdf()
