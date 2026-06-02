import fs from 'fs';
import path from 'path';

const VAULT_DIR = path.join(process.cwd(), 'Obsidian_Vault_Export');
const COURSES_DIR = path.join(VAULT_DIR, 'Courses');
const GOALS_DIR = path.join(VAULT_DIR, 'Goals & Tasks');
const COMMITMENTS_DIR = path.join(VAULT_DIR, 'Commitments');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function createSampleVault() {
  console.log("No Supabase keys detected in .env. Generating a Sample Obsidian Vault...");
  
  ensureDir(VAULT_DIR);
  ensureDir(COURSES_DIR);
  ensureDir(GOALS_DIR);
  ensureDir(COMMITMENTS_DIR);

  // 1. Course Sample
  const csDir = path.join(COURSES_DIR, 'Computer_Science_101');
  ensureDir(csDir);

  const courseContent = `---
id: course-123
type: course
status: ACTIVE
---
# Computer Science 101

Welcome to CS101. This is a foundational course.

## Topics
- [[Data_Structures]]
- [[Algorithms]]
`;
  fs.writeFileSync(path.join(COURSES_DIR, 'Computer_Science_101.md'), courseContent);

  // 2. Topic Sample
  const topicContent = `---
id: topic-456
type: topic
course: "[[Computer_Science_101]]"
---
# Data Structures

The study of organizing data efficiently.

## Subtopics
- [[Arrays_and_Lists]]
- [[Trees_and_Graphs]]
`;
  fs.writeFileSync(path.join(csDir, 'Data_Structures.md'), topicContent);

  // 3. Subtopic & Tasks Sample
  const subContent = `---
id: sub-789
type: subtopic
topic: "[[Data_Structures]]"
---
# Arrays and Lists

Understanding contiguous vs linked memory.

## Tasks
- [x] Read Chapter 1
- [ ] Complete Array Implementation Lab
`;
  fs.writeFileSync(path.join(csDir, 'Arrays_and_Lists.md'), subContent);

  // 4. Weekly Goal Sample
  const goalContent = `---
id: goal-001
type: weekly_goal
status: ACTIVE
---
# Weekly Goal: May 29, 2026

## Focus Areas
- Finish CS101 Labs
- Start Algorithm Research

## Tasks
- [[Complete_Array_Implementation_Lab]]
`;
  fs.writeFileSync(path.join(GOALS_DIR, 'Week_2026-05-29.md'), goalContent);

  // 5. MicroTask Sample
  const taskContent = `---
id: task-001
type: microtask
priority: 1
status: PENDING
goal: "[[Week_2026-05-29]]"
---
# Complete Array Implementation Lab

**Status**: PENDING
**Subject**: [[Arrays_and_Lists]]

- [ ] Write dynamic array class in C++
- [ ] Pass unit tests
`;
  fs.writeFileSync(path.join(GOALS_DIR, 'Complete_Array_Implementation_Lab.md'), taskContent);

  // 6. Commitment Sample
  const commitContent = `---
id: commit-111
type: commitment
duration_mins: 90
rrule: FREQ=WEEKLY;BYDAY=MO,WE,FR
---
# CS101 Lecture

Starts at: 10:00:00 GMT
Location: Room 404
`;
  fs.writeFileSync(path.join(COMMITMENTS_DIR, 'CS101_Lecture.md'), commitContent);
}

function main() {
  createSampleVault();
  console.log('✅ Sample Obsidian Vault Generated!');
  console.log(`Open Obsidian and choose "Open folder as vault" and select: ${VAULT_DIR}`);
}

main();
