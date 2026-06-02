def package_weekly_tasks(db_session, student_capacity_mins=2160):
    """
    Distributes raw micro-tasks into weekly goal buckets based on syllabus schedules.
    Enforces a strict upper bound on weekly cognitive load.
    """
    # Fetch all 18 weeks of the semester chronologically
    with db_session.cursor() as cursor:
        cursor.execute("SELECT goal_id, semester_week_number FROM weekly_goals ORDER BY semester_week_number")
        weeks = cursor.fetchall()
        
        for week in weeks:
            goal_id = week[0]
            semester_week_number = week[1]
            current_load_mins = 0
            
            # Fetch topics naturally assigned to this week across all enrolled subjects
            cursor.execute(
                "SELECT topic_id FROM topics WHERE assigned_week = %s",
                (semester_week_number,)
            )
            topics = cursor.fetchall()
            
            for topic in topics:
                topic_id = topic[0]
                
                # Fetch sequentially ordered tasks for the topic
                cursor.execute(
                    "SELECT task_id, estimated_duration_mins FROM micro_tasks WHERE topic_id = %s ORDER BY created_at",
                    (topic_id,)
                )
                tasks = cursor.fetchall()
                
                for task in tasks:
                    task_id = task[0]
                    estimated_duration_mins = task[1]
                    
                    if current_load_mins + estimated_duration_mins <= student_capacity_mins:
                        # Allocate task to current week's bucket
                        cursor.execute(
                            "INSERT INTO task_status (task_id, goal_id, current_status) VALUES (%s, %s, 'pending')",
                            (task_id, goal_id)
                        )
                        current_load_mins += estimated_duration_mins
                    else:
                        # Capacity breached: The student's workload exceeds theoretical limits.
                        # Task is held back and must be processed by the Priority Rollover Engine.
                        break
        
        db_session.commit()
