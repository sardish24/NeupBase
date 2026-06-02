def get_goal_id(cursor, week_num):
    cursor.execute("SELECT goal_id FROM weekly_goals WHERE semester_week_number = %s", (week_num,))
    result = cursor.fetchone()
    return result[0] if result else None

def get_current_week_load(cursor, goal_id):
    cursor.execute("""
        SELECT COALESCE(SUM(mt.estimated_duration_mins), 0)
        FROM task_status ts
        JOIN micro_tasks mt ON ts.task_id = mt.task_id
        WHERE ts.goal_id = %s AND ts.current_status = 'pending'
    """, (goal_id,))
    return cursor.fetchone()[0]

def execute_weekly_rollover(db_session, current_week_num: int):
    """
    Identifies unfinished tasks at the close of the week, applies the priority 
    mathematical model, and rolls them into the subsequent week.
    """
    next_week_num = current_week_num + 1
    if next_week_num > 18:
        return # Semester concluded
        
    with db_session.cursor() as cursor:
        current_goal_id = get_goal_id(cursor, current_week_num)
        next_goal_id = get_goal_id(cursor, next_week_num)
        
        if not current_goal_id or not next_goal_id:
            return

        # 1. Fetch pending tasks from the closing week using the partial index
        cursor.execute("""
            SELECT ts.task_id, ts.rollover_count, mt.base_difficulty, mt.is_exam_prep, mt.estimated_duration_mins
            FROM task_status ts
            JOIN micro_tasks mt ON ts.task_id = mt.task_id
            WHERE ts.goal_id = %s AND ts.current_status = 'pending'
        """, (current_goal_id,))
        pending_tasks = cursor.fetchall()
        
        # 2. Update historical status to preserve analytics
        cursor.execute("""
            UPDATE task_status 
            SET current_status = 'rolled_over', updated_at = NOW() 
            WHERE goal_id = %s AND current_status = 'pending'
        """, (current_goal_id,))
        
        # 3. Calculate new Priority Scores based on the mathematical formula
        alpha, beta, gamma = 1.0, 0.75, 4.0
        tasks_with_priority = []
        
        for task in pending_tasks:
            task_id, rollover_count, base_difficulty, is_exam_prep, estimated_duration_mins = task
            new_rollover_count = rollover_count + 1
            
            # Calculate proximity to Week 8 Midterm or Week 16 Final
            dist_midterm = abs(8 - next_week_num)
            dist_final = abs(16 - next_week_num)
            exam_proximity_factor = max(1.0 / (dist_midterm + 1), 1.0 / (dist_final + 1))
            
            # Base Equation P(t)
            priority_score = (alpha * float(base_difficulty)) + \
                             (beta * new_rollover_count) + \
                             (gamma * exam_proximity_factor)
                             
            if is_exam_prep:
                priority_score += 2.5 # Delta boost
                
            tasks_with_priority.append({
                "task_id": task_id,
                "priority": priority_score,
                "duration": estimated_duration_mins,
                "rollover_count": new_rollover_count
            })
            
        # 4. Sort tasks descending by highest priority
        tasks_with_priority.sort(key=lambda x: x["priority"], reverse=True)
        
        # 5. Insert into next week's bucket, rigorously respecting capacity limits
        current_capacity = get_current_week_load(cursor, next_goal_id)
        max_capacity = 2160 # 36 hours maximum theoretical limit
        
        for pt in tasks_with_priority:
            if current_capacity + pt["duration"] <= max_capacity:
                # Task successfully rolls over into the active dashboard
                cursor.execute("""
                    INSERT INTO task_status (task_id, goal_id, current_status, rollover_count, dynamic_priority_score)
                    VALUES (%s, %s, 'pending', %s, %s)
                """, (pt['task_id'], next_goal_id, pt['rollover_count'], pt['priority']))
                current_capacity += pt["duration"]
            else:
                # Backlog State: The task is starved due to absolute capacity exhaustion.
                # Assigned a distinct state to prevent UI clutter while awaiting future clearance.
                cursor.execute("""
                    INSERT INTO task_status (task_id, goal_id, current_status, rollover_count, dynamic_priority_score)
                    VALUES (%s, %s, 'backlog', %s, %s)
                """, (pt['task_id'], next_goal_id, pt['rollover_count'], pt['priority']))
                
        db_session.commit()
