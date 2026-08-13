---
id: {{TASK_ID}}
title: {{TITLE}}
status: CAPTURED

type: feature
profile: {{PROFILE}}

risk:
  level: medium
  reasons: []

# models 는 생략하면 프로파일/프로젝트 설정을 따른다. 필요할 때만 override.
# models:
#   worker: auto

human:
  owner: {{OWNER}}
  reviewer_required: true

coordination:
  parent_task: null
  depends_on: []
  owned_paths: []

loop:
  stop_when:
    - acceptance criteria pass
    - required evaluators pass
    - no open high/medium findings
  required_evidence: []
---

## Problem

## What we are shipping

## What we are not shipping

## Facts

## Decisions

## Assumptions

## Relevant context

## Allowed scope

## Forbidden scope

## Acceptance criteria

## Human judgment

## Verification

## Rollback
