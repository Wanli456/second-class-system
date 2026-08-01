from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn

doc = Document()

# 设置默认字体
style = doc.styles['Normal']
font = style.font
font.name = '微软雅黑'
font.size = Pt(12)
style.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')

# 页面边距
for section in doc.sections:
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.8)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)

def add_title(text, level=1):
    if level == 1:
        heading = doc.add_heading(text, level=1)
        for run in heading.runs:
            run.font.size = Pt(18)
            run.font.color.rgb = RGBColor(30, 58, 95)
    elif level == 2:
        heading = doc.add_heading(text, level=2)
        for run in heading.runs:
            run.font.size = Pt(15)
            run.font.color.rgb = RGBColor(30, 58, 95)
    elif level == 3:
        heading = doc.add_heading(text, level=3)
        for run in heading.runs:
            run.font.size = Pt(13)
            run.font.color.rgb = RGBColor(30, 58, 95)
    return heading

def add_para(text, bold=False):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.font.size = Pt(12)
    run.bold = bold
    run.font.name = '微软雅黑'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.3
    return p

def add_list_item(text, indent=0):
    p = doc.add_paragraph(text, style='List Bullet')
    for run in p.runs:
        run.font.size = Pt(12)
        run.font.name = '微软雅黑'
        run.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.3
    if indent > 0:
        p.paragraph_format.left_indent = Inches(0.3 * indent)
    return p

# 封面
for _ in range(4):
    doc.add_paragraph()

title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title.add_run('二课活动管理系统')
run.font.size = Pt(28)
run.bold = True
run.font.color.rgb = RGBColor(30, 58, 95)
run.font.name = '微软雅黑'
run.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')

subtitle = doc.add_paragraph()
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = subtitle.add_run('使用说明书')
run.font.size = Pt(22)
run.font.color.rgb = RGBColor(30, 58, 95)
run.font.name = '微软雅黑'
run.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')

doc.add_paragraph()

info = doc.add_paragraph()
info.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = info.add_run('第二课堂活动管理平台')
run.font.size = Pt(14)
run.font.color.rgb = RGBColor(100, 100, 100)
run.font.name = '微软雅黑'
run.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')

doc.add_page_break()

# 目录
add_title('目录', 1)
add_para('1. 系统简介', bold=True)
add_para('2. 学生使用指南', bold=True)
add_para('3. 活动负责人使用指南', bold=True)
add_para('4. 发布干事使用指南', bold=True)
add_para('5. 赋分干事使用指南', bold=True)
add_para('6. 管理员使用指南', bold=True)
add_para('7. 常见问题', bold=True)

doc.add_page_break()

# 1. 系统简介
add_title('1. 系统简介', 1)
add_para('二课活动管理系统是一个用于管理第二课堂活动的平台，主要功能包括：')
add_list_item('活动管理：发布、审核、管理各类第二课堂活动')
add_list_item('请假管理：学生提交请假申请，管理员审核')
add_list_item('活动赋分：对完成的活动进行学分赋分')
add_list_item('晚自习查询：查询晚自习请假记录')

add_para('访问地址：', bold=True)
add_para('https://cf6e37ac-76fa-4ad2-b5a2-4ac4699268b4-5000.dev.coze.site')

# 2. 学生使用指南
add_title('2. 学生使用指南', 1)
add_para('适用对象：所有在校学生（无需注册账号）', bold=True)

add_title('2.1 提交请假申请', 2)
add_para('使用场景：因事假、病假或参加公共活动需要请假时')
add_para('操作步骤：', bold=True)
add_list_item('打开系统首页')
add_list_item('点击「请假申请」卡片')
add_list_item('填写请假信息：学号、班级、姓名、请假类型、请假条图片（必填）')
add_list_item('点击「提交请假」')
add_list_item('提交成功后，可以查询请假状态')

add_title('2.2 晚自习请假查询', 2)
add_para('使用场景：查询晚自习请假记录')
add_para('操作步骤：', bold=True)
add_list_item('点击首页「晚自习请假查询」')
add_list_item('选择查询方式：按班级/按姓名/按学号')
add_list_item('查看查询结果')

# 3. 活动负责人使用指南
add_title('3. 活动负责人使用指南', 1)
add_para('适用对象：负责组织和申报活动的学生（需要注册账号）', bold=True)

add_title('3.1 注册账号', 2)
add_list_item('打开系统首页，点击右上角「登录/注册」')
add_list_item('点击「去注册」')
add_list_item('填写信息：学号、姓名、密码，角色选择「负责人」')
add_list_item('点击「注册」')

add_title('3.2 提交活动', 2)
add_para('使用场景：组织活动后，向学校申报活动信息')
add_para('操作步骤：', bold=True)
add_list_item('登录后，点击首页「活动提交」')
add_list_item('填写活动信息：活动名称、类别、级别、时间、负责人信息')
add_list_item('点击「提交活动」')

add_title('3.3 提交赋分材料', 2)
add_para('使用场景：活动结束后，提交赋分所需的材料')
add_para('操作步骤：', bold=True)
add_list_item('点击首页「赋分材料提交」')
add_list_item('输入负责人手机号查询已提交的活动')
add_list_item('上传赋分表和备案表照片')
add_list_item('点击「提交材料」')

# 4. 发布干事使用指南
add_title('4. 发布干事使用指南', 1)
add_para('适用对象：负责审核活动发布的干事（需要管理员赋予权限）', bold=True)

add_title('4.1 审核活动提交', 2)
add_para('操作步骤：', bold=True)
add_list_item('登录后，点击首页「发布活动」')
add_list_item('查看待审核的活动列表')
add_list_item('点击活动查看详细信息（策划书、备案表可下载）')
add_list_item('选择审核结果：通过或驳回')

# 5. 赋分干事使用指南
add_title('5. 赋分干事使用指南', 1)
add_para('适用对象：负责对活动进行赋分的干事（需要管理员赋予权限）', bold=True)

add_title('5.1 活动赋分', 2)
add_para('操作步骤：', bold=True)
add_list_item('登录后，点击首页「活动赋分」')
add_list_item('查看待赋分的活动列表')
add_list_item('点击活动查看详细信息（赋分表、备案表照片可下载）')
add_list_item('确认材料无误后，点击「确认赋分」')

add_para('赋分规则：', bold=True)
add_list_item('院系级活动：只需审核赋分表')
add_list_item('校级活动：需要审核赋分表 + 备案表照片')

# 6. 管理员使用指南
add_title('6. 管理员使用指南', 1)
add_para('适用对象：系统管理员（拥有全部权限）', bold=True)

add_title('6.1 活动总表管理', 2)
add_list_item('查看活动列表：按类别、级别筛选，搜索活动名称')
add_list_item('添加活动：点击「添加活动」填写信息')
add_list_item('编辑活动：点击活动右侧的「编辑」按钮')
add_list_item('删除活动：点击活动右侧的「删除」按钮')

add_title('6.2 用户管理', 2)
add_list_item('查看用户列表：查看所有注册用户')
add_list_item('修改权限：修改角色、开启/关闭各项权限')
add_list_item('添加用户：点击「添加用户」填写信息')

# 7. 常见问题
add_title('7. 常见问题', 1)

add_title('Q1：网址打不开怎么办？', 3)
add_para('系统可能进入休眠状态。等待 1-2 分钟后刷新页面，或联系管理员唤醒系统。')

add_title('Q2：忘记密码怎么办？', 3)
add_para('联系管理员重置密码，或者重新注册一个新账号。')

add_title('Q3：如何知道我的活动是否赋分完成？', 3)
add_para('登录系统后，查看首页右上角的通知铃铛。如果有新通知，铃铛上会显示红色数字，点击铃铛查看通知详情。')

add_title('Q4：上传文件大小有限制吗？', 3)
add_para('单个文件最大 10MB，支持格式：图片（JPG、PNG）、PDF、Word 文档。')

add_title('Q5：为什么我看不到某些功能入口？', 3)
add_para('部分功能需要登录才能使用，部分功能需要特定权限。联系管理员开通相应权限。')

# 保存
doc.save('/workspace/projects/public/二课活动管理系统使用说明书.docx')
print('Word 文档已生成：/workspace/projects/public/二课活动管理系统使用说明书.docx')
