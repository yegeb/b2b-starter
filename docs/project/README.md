# Project plan

The immediate goal is to test the existing application locally.
The later goal is to integrate it with the proposed cloud architecture.
The [course brief](<CMPE 48A Term Project.pdf>) sets the project requirements.
The [cloud architecture](tentative-cloud-architecture.pdf) is tentative and needs validation before deployment.

## Now: test the application

Start with [application testing](https://github.com/yegeb/b2b-starter/issues/16).
Use the task issues for the HTTP suite, test data, buyer journey, access checks, and builds.
Keep test databases separate from any demonstration store.
Record the revision, actions, results, and remaining failures for each test.
Create or update focused issues for bugs, features, and missing tests.
Reference relevant issues in commits and pull requests.
Use Codex for this work.
Ask before merging.
Additional follow-ups cover [database settings](https://github.com/yegeb/b2b-starter/issues/88), [quote details](https://github.com/yegeb/b2b-starter/issues/89), [quote access](https://github.com/yegeb/b2b-starter/issues/90), and [build regression checks](https://github.com/yegeb/b2b-starter/issues/91).

The [local container preview](https://github.com/yegeb/b2b-starter/issues/76) helps the team inspect the app.
Its [open pull request](https://github.com/yegeb/b2b-starter/pull/32) records catalog, cart, admin, and Linux build checks.
Those checks are partial evidence for the application baseline.
Local Docker is a test setup, not the intended cloud deployment architecture.

The earlier [application brief](https://github.com/yegeb/b2b-starter/blob/6af1e8a9ea7e41391e7c97d5b0b0570184fb1de6/docs/project/implementation-plan/01-application.md) records the original trials and remaining acceptance criteria.
Those trials and the open issues do not establish that the milestone is complete.
The [closed build-evidence pull request](https://github.com/yegeb/b2b-starter/pull/92) was not merged.
Its findings need review against the current testing scope.

## Later: integrate and evaluate

The proposed architecture includes GKE workloads, virtual machines, and a load balancer.
Decisions, prerequisites, costs, and deployed behavior still need review and evidence.
The following issues retain the detailed tasks and acceptance criteria:

| Area | Tracking issue |
| --- | --- |
| Runtime, worker, and Redis | [#17](https://github.com/yegeb/b2b-starter/issues/17) |
| Business events | [#18](https://github.com/yegeb/b2b-starter/issues/18) |
| Notifications | [#19](https://github.com/yegeb/b2b-starter/issues/19) |
| Quote documents | [#20](https://github.com/yegeb/b2b-starter/issues/20) |
| Product images | [#21](https://github.com/yegeb/b2b-starter/issues/21) |
| Cloud foundation and VMs | [#22](https://github.com/yegeb/b2b-starter/issues/22) |
| GKE and HTTPS | [#23](https://github.com/yegeb/b2b-starter/issues/23) |
| Performance and cost | [#24](https://github.com/yegeb/b2b-starter/issues/24) |
| Reproduction and course submission | [#25](https://github.com/yegeb/b2b-starter/issues/25) |

The [earlier roadmap and release sequence](https://github.com/yegeb/b2b-starter/blob/6af1e8a9ea7e41391e7c97d5b0b0570184fb1de6/docs/project/implementation-plan/README.md) preserve task dependencies, proposed designs, and historical evidence.
They are part of an [open pull request](https://github.com/yegeb/b2b-starter/pull/27), so their design choices are not completed deployment work.
Review their assumptions before implementation.
[Issue #15](https://github.com/yegeb/b2b-starter/issues/15) links the plan and related work.
