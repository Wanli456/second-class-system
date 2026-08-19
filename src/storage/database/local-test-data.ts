const TEST_IMAGE_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export const LOCAL_TEST_DATA_SQL = `
  INSERT INTO activities (
    id, full_name, start_time, end_time, registration_start_time, registration_end_time,
    category, category_primary, category_secondary, level, plan_file_url, plan_file_name,
    record_file_url, record_file_name, record_photo_url, record_photo_file_name,
    leader_name, leader_phone, scope_type, scope_name, scope_names, leader_ids,
    activity_submitter_id, activity_submitter_name, activity_submitter_student_id,
    scoring_material_submitter_id, scoring_material_submitter_name, scoring_material_submitter_student_id,
    status, scoring_status, scoring_table_url, scoring_table_file_name
  ) VALUES
    ('EK202608001', '校园人工智能创新周', '2026-08-22 09:00:00', '2026-08-24 17:00:00', '2026-08-19 09:00:00', '2026-08-21 18:00:00', '智', '科技创新', '人工智能', '校级', '${TEST_IMAGE_URL}', '人工智能创新周策划书.png', '${TEST_IMAGE_URL}', '校级活动备案表.png', '${TEST_IMAGE_URL}', '备案表照片.png', '陈思远', '13900000001', 'department', '学生会', '[{"type":"department","name":"学生会"}]', '["local-leader"]', 'local-leader', '本地负责人', '9000000005', 'local-leader', '本地负责人', '9000000005', '正常活动', '待赋分', '${TEST_IMAGE_URL}', '人工智能创新周赋分表.png'),
    ('EK202608002', '计算机学院新生篮球赛', '2026-08-25 14:00:00', '2026-08-25 17:30:00', '2026-08-20 09:00:00', '2026-08-24 12:00:00', '体', '体育竞技', '篮球', '院系级', '${TEST_IMAGE_URL}', '新生篮球赛策划书.png', '${TEST_IMAGE_URL}', '院级备案表.png', NULL, NULL, '林子涵', '13900000002', 'department', '学生会', '[{"type":"department","name":"学生会"}]', '["local-leader"]', 'local-leader', '本地负责人', '9000000005', 'local-leader', '本地负责人', '9000000005', '正常活动', '待赋分', '${TEST_IMAGE_URL}', '篮球赛赋分表.png'),
    ('EK202608003', '青年志愿服务月启动仪式', '2026-08-18 14:00:00', '2026-08-18 17:00:00', '2026-08-10 09:00:00', '2026-08-17 18:00:00', '德', '志愿服务', '社区服务', '校级', '${TEST_IMAGE_URL}', '志愿服务月策划书.png', '${TEST_IMAGE_URL}', '志愿服务备案表.png', '${TEST_IMAGE_URL}', '志愿服务备案表照片.png', '周雨晴', '13900000003', 'department', '学生会', '[{"type":"department","name":"学生会"}]', '["local-leader"]', 'local-leader', '本地负责人', '9000000005', 'local-leader', '本地负责人', '9000000005', '正常活动', '已赋分', '${TEST_IMAGE_URL}', '志愿服务月赋分表.png'),
    ('EK202608004', '校园歌手大赛海选', '2026-08-28 18:30:00', '2026-08-28 21:30:00', '2026-08-18 09:00:00', '2026-08-26 18:00:00', '美', '文艺活动', '声乐', '校级', '${TEST_IMAGE_URL}', '歌手大赛策划书.png', '${TEST_IMAGE_URL}', '歌手大赛备案表.png', '${TEST_IMAGE_URL}', '歌手大赛备案表照片.png', '许清扬', '13900000004', 'department', '学生会', '[{"type":"department","name":"学生会"}]', '["local-leader"]', 'local-leader', '本地负责人', '9000000005', NULL, NULL, NULL, '活动取消', '待赋分', NULL, NULL);

  INSERT INTO activity_submissions (
    id, full_name, start_time, end_time, registration_start_time, registration_end_time,
    category, category_primary, category_secondary, level, plan_file_url, plan_file_name,
    record_file_url, record_file_name, leader_name, leader_phone, scope_type, scope_name,
    scope_names, leader_ids, activity_submitter_id, activity_submitter_name,
    activity_submitter_student_id, activity_id, review_status, review_note
  ) VALUES
    ('local-submission-pending-1', '跨学院算法挑战赛', '2026-08-29 09:00:00', '2026-08-29 17:00:00', '2026-08-20 09:00:00', '2026-08-27 18:00:00', '智', '学术竞赛', '算法竞赛', '校级', '${TEST_IMAGE_URL}', '算法挑战赛策划书.png', '${TEST_IMAGE_URL}', '算法挑战赛备案表.png', '顾明轩', '13900000011', 'department', '学生会', '[{"type":"department","name":"学生会"}]', '["local-leader"]', 'local-leader', '本地负责人', '9000000005', NULL, '待审核', NULL),
    ('local-submission-pending-2', '宿舍文化节作品展', '2026-08-30 10:00:00', '2026-08-30 16:00:00', '2026-08-21 09:00:00', '2026-08-28 18:00:00', '劳', '校园文化', '宿舍文化', '院系级', '${TEST_IMAGE_URL}', '宿舍文化节策划书.png', '${TEST_IMAGE_URL}', '宿舍文化节备案表.png', '沈书言', '13900000012', 'department', '学生会', '[{"type":"department","name":"学生会"}]', '["local-leader"]', 'local-leader', '本地负责人', '9000000005', NULL, '待审核', NULL),
    ('local-submission-approved', '青年志愿服务月启动仪式', '2026-08-18 14:00:00', '2026-08-18 17:00:00', '2026-08-10 09:00:00', '2026-08-17 18:00:00', '德', '志愿服务', '社区服务', '校级', '${TEST_IMAGE_URL}', '志愿服务月策划书.png', '${TEST_IMAGE_URL}', '志愿服务备案表.png', '周雨晴', '13900000003', 'department', '学生会', '[{"type":"department","name":"学生会"}]', '["local-leader"]', 'local-leader', '本地负责人', '9000000005', 'EK202608003', '已通过', '材料齐全，已通过审核'),
    ('local-submission-rejected', '校园创意市集', '2026-08-27 13:00:00', '2026-08-27 18:00:00', '2026-08-19 09:00:00', '2026-08-25 18:00:00', '美', '校园文化', '创意市集', '院系级', '${TEST_IMAGE_URL}', '创意市集策划书.png', '${TEST_IMAGE_URL}', '创意市集备案表.png', '唐若溪', '13900000013', 'department', '学生会', '[{"type":"department","name":"学生会"}]', '["local-leader"]', 'local-leader', '本地负责人', '9000000005', NULL, '已驳回', '活动时间与校内大型活动冲突，请调整后重新提交');

  INSERT INTO leave_groups (
    id, class_name, applicant_user_id, applicant_name, applicant_student_id, leave_type,
    activity_id, activity_name, start_time, end_time, review_status, review_note
  ) VALUES
    ('local-leave-group-pending', '计算机2101', 'local-leader', '本地负责人', '9000000005', '活动公假', 'EK202608001', '校园人工智能创新周', '2026-08-22 13:00:00', '2026-08-22 17:00:00', '待审核', NULL);

  INSERT INTO leave_requests (
    id, student_id, class_name, student_name, leave_type, leave_image_url, leave_image_name,
    activity_id, activity_name, applicant_user_id, applicant_name, applicant_student_id,
    group_id, start_time, end_time, review_status, review_note
  ) VALUES
    ('local-leave-pending', '9000000006', '计算机2101', '本地学生', '病假', '${TEST_IMAGE_URL}', '病假条.png', NULL, NULL, 'local-student', '本地学生', '9000000006', NULL, '2026-08-21 19:00:00', '2026-08-21 21:00:00', '待审核', NULL),
    ('local-leave-approved', '9000000005', '计算机2101', '本地负责人', '事假', NULL, NULL, NULL, NULL, 'local-leader', '本地负责人', '9000000005', NULL, '2026-08-20 18:30:00', '2026-08-20 21:30:00', '已通过', '请按时返校'),
    ('local-leave-rejected', '9000000006', '计算机2101', '本地学生', '事假', NULL, NULL, NULL, NULL, 'local-student', '本地学生', '9000000006', NULL, '2026-08-23 18:30:00', '2026-08-23 21:30:00', '已驳回', '请补充有效请假证明'),
    ('local-leave-group-pending-1', '9000000005', '计算机2101', '本地负责人', '活动公假', '${TEST_IMAGE_URL}', '集体请假证明.png', 'EK202608001', '校园人工智能创新周', 'local-leader', '本地负责人', '9000000005', 'local-leave-group-pending', '2026-08-22 13:00:00', '2026-08-22 17:00:00', '待审核', NULL),
    ('local-leave-group-pending-2', '9000000006', '计算机2101', '本地学生', '活动公假', '${TEST_IMAGE_URL}', '集体请假证明.png', 'EK202608001', '校园人工智能创新周', 'local-leader', '本地负责人', '9000000005', 'local-leave-group-pending', '2026-08-22 13:00:00', '2026-08-22 17:00:00', '待审核', NULL),
    ('local-leave-group-pending-3', '9000000007', '计算机2101', '本地未注册学生', '活动公假', '${TEST_IMAGE_URL}', '集体请假证明.png', 'EK202608001', '校园人工智能创新周', 'local-leader', '本地负责人', '9000000005', 'local-leave-group-pending', '2026-08-22 13:00:00', '2026-08-22 17:00:00', '待审核', NULL);

  INSERT INTO leave_group_members (id, group_id, student_id, student_name, class_name, leave_request_id) VALUES
    ('local-group-member-1', 'local-leave-group-pending', '9000000005', '本地负责人', '计算机2101', 'local-leave-group-pending-1'),
    ('local-group-member-2', 'local-leave-group-pending', '9000000006', '本地学生', '计算机2101', 'local-leave-group-pending-2'),
    ('local-group-member-3', 'local-leave-group-pending', '9000000007', '本地未注册学生', '计算机2101', 'local-leave-group-pending-3');
`;
