# 09 · Locust, observability and trial cost

**Assignment.** Infrastructure designs the experiment. Reviewer checks that the comparison is reproducible. Use architecture §§3.1–3.4 and the course performance criteria. Supply functional and financial evidence for the report.

## Experiment design

| Run | Independent variables and controls | Outcome and evidence |
| --- | --- | --- |
| Calibration | Use a temporary e2-standard-2 Locust VM. Start with one synthetic user per journey. Use a seeded region, stocked SKU, fixed application revision and test payment/email transports. | Compare completed user actions with backend records. Record generator CPU, exceptions and timeouts. Fix fixture failures before measuring latency. |
| Interactive mix | Proposed mix of completed journeys: browse/search 50%, cart 25%, approval 15%, quote 10%. Model buyer, approver and merchant with separate credentials. Give each synthetic buyer an isolated cart. | Record requests/s, completed journeys/s, median and p95 latency, and errors by endpoint and journey. Save the actual mix; route request counts differ from journey counts. |
| Fixed API vs HPA | Use the same fixtures, request mix, node policy, starting replicas, request limits, warm-up and think time. Exercise 10, 25 and 50 concurrent users. Attempt 100 only if capacity and remaining budget permit. | Align Locust time series with replica counts, CPU, memory and pending pods. Record queue time and node scale events. Repeat comparable runs and record variance. |
| Async completion | Use bounded image, notification and quote bursts. Track a stable ID from upload/send/request to published catalog image, email receipt or available PDF. Include worker and function retry cases. | Record acceptance latency separately from completion latency. Count unique successes, terminal failures, duplicates and outstanding jobs at the end of observation. |

For a first comparison, ramp at two users per second, warm for two minutes, measure five minutes and cool down to baseline. Repeat each fixed/HPA pair three times, alternating order. Treat these as proposed settings. If a pilot shows that HPA stabilization or node startup exceeds the window, lengthen both runs equally and record the change. Keep the generator location and ingress path constant.

## Cost worksheet

The following figures reproduce the submitted estimate. Enter current unit prices and actual account data in the ledger before cloud work. Preserve dated evidence for each change. [PDF cost estimate](../tentative-cloud-architecture.pdf) · [Pricing calculator](https://cloud.google.com/products/calculator)

| PDF estimate group | Budgeted USD | Quantity to track |
| --- | ---: | --- |
| GKE nodes and management | 38.77 | 200 cluster-hours, 280 aggregate node-hours, at most 80 second-node hours |
| PostgreSQL and Redis VMs | 15.00 | Up to 250 hours each |
| Persistent disks | 32.00 | 100 GiB node disks for one month, 70 GiB VM disks for three months, 10 GiB generator disk for one month |
| HTTPS balancer and NAT | 10.50 | 250 hours each, forwarding rules, data processing and NAT IP |
| Locust VM and internet transfer | 22.69 | 40 generator-hours and 20 GiB internet egress |
| Functions, events, storage and backups | 14.00 | Three functions with 0–2 instances each, up to 10 GiB stored objects and 50 GiB aggregate Pub/Sub throughput |
| Build, registry and scanning | 36.00 | 500 build-minutes, 10 GiB retained images for three months, up to 100 billed scans |
| Logging, monitoring, secrets and DNS | 16.00 | 10 GiB project log ingestion, secret access and optional DNS zone |
| **Base / contingency / working target** | **184.96 / 40.04 / 225.00** | **$75 reserve against the $300 trial ceiling** |

Use columns for resource, SKU, region, unit, estimate, current rate, actual quantity, actual cost, forecast-to-finish, owner and observation time. Include retained disks, addresses, NAT, load balancer, backups, object versions, build sources and idle clusters. Record third-party email and domain costs separately. Budget alerts at $50, $100, $150, $200 and $250 are notifications. Check actual credit after each cloud session. [Cloud Billing budgets](https://cloud.google.com/billing/docs/how-to/budgets)

**Measurement contract, proposed.** Use run IDs containing revision, fixture batch, fixed/HPA mode, user count and repeat number. Name dynamic Locust requests by route template. Capture `--csv` and `--csv-full-history` for per-route history. Measure one journey success only after its last business assertion passes. Treat HTTP 200 with a checkout error or a buyer error boundary as a failed journey. Exclude warm-up and cooldown samples from both arms. Report observations per run, then median and range across paired repeats. Align UTC timestamps at a common sampling interval and mark scale decisions and Ready times. Record sample count beside p95. Keep fixture creation outside the measurement interval. [Locust CSV options](https://docs.locust.io/en/2.37.8/configuration.html) · [Observed buyer failure](01-application.md)

**Budget gate, checked against PDF §3 on 19 November 2026.** The eight estimate groups sum to USD 184.96. Contingency brings the working target to USD 225. Three load levels × two configurations × three repeats yield 18 measured runs before the optional 100-user stage. At five measured minutes each, the initial matrix uses 90 minutes of measurement plus ramp, warm-up, cooldown and resets. Book the full elapsed time against the 15 interactive cluster-hours. At session close, calculate spent-to-date plus forecast remaining compute, retained storage and networking. Halt additional runs if projected total spend exceeds USD 225. Compare the remaining forecast alone with available trial credit and halt if it exceeds that balance. Record actual balance and rates in G1/P4. Cost and performance figures here are design inputs. No load or billing measurements have been collected. [PDF budget](../tentative-cloud-architecture.pdf) · [Budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)

| ID · owner | Depends on | Task and acceptance evidence |
| --- | --- | --- |
| P1 · Infrastructure | A3, N2, Q3, I4 | Write versioned Locust tasks, seeded fixture instructions and expected outcomes. Ensure concurrent merchant and approver actions select their own synthetic records. Record seed, mix and timings. Save a calibrated smoke result. |
| P2 · Infrastructure | P1, K5 | Run fixed/HPA pairs. Capture Locust CSVs with history, GKE metrics, run parameters, commit and UTC timestamps. Hit the same HTTPS routes users use. Verify results include request latency, throughput, CPU/memory, errors and replica count for both configurations. |
| P3 · Infrastructure | P1, N4, Q4, Q5, I4, K4 | Run bounded async and retry checks. Record separate start, acceptance and completion times. Cap total jobs at 1,000 images, 1,000 PDFs and 10,000 notifications across the project. Track the PDF's 120,000 billed vCPU-second and 60,000 GiB-second ceilings across all three functions. Reconcile unique side effects against accepted jobs. |
| P4 · Reviewer | G1, before each run and after P2–P3 | Reprice billable resources. Allocate 35 cluster test-hours as 5 setup, 15 interactive, 8 async, 7 repeat/analysis. Stop a run for incorrect outcomes, sustained saturation of the generator, projected target overrun or insufficient remaining credit. Save ledger and usage evidence with retained-resource forecast. |

**Exit evidence.** Use paired charts with labeled units and sample intervals. Explain the observed bottleneck, error behavior, HPA delay and any generator limit. Cite actual outcomes. [Locust CSV output](https://docs.locust.io/en/2.37.8/configuration.html)
