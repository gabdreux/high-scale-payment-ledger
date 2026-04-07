# High-Scale Serverless Payment Ledger

![Node.js CI](https://github.com/gabdreux/high-scale-payment-ledger/actions/workflows/node.js.yml/badge.svg)

A cloud-native, event-driven ledger engine built with **AWS Serverless** architecture. Designed for high-frequency financial transactions with a focus on **Strong Consistency**, **Idempotency**, and **Zero-Trust Security**.

---

## Architectural Philosophy

This project follows a **Pure Cloud-Native** approach. 

### Why No Docker?
Unlike traditional containerized setups, this engine is designed to run on the actual AWS environment from day one. By leveraging **AWS SAM Sync**, we eliminate the "works on my machine" syndrome and the overhead of local emulators. The local environment is used strictly for logic development, while the cloud handles the infrastructure, ensuring 100% parity between development and production.

---

## System Design

### 1. Synchronous Flow: ACID & Idempotency
To prevent **Double Spending** and **Race Conditions**, the core processor utilizes **DynamoDB Transactions**. 

* **Idempotency Lock:** Every request requires an `idempotencyKey`. We use a conditional `PutItem` to ensure a transaction is processed exactly once.
* **Atomic Transactions:** Balance deduction, credit, and ledger logging happen in a single `TransactWriteItems` operation. If any step fails (e.g., insufficient funds), the entire operation rolls back.



### 2. Asynchronous Flow: Event-Driven Decoupling
Once the transaction is committed, the system triggers a reactive flow to handle side effects without blocking the main execution.

* **DynamoDB Streams:** Captures changes in real-time.
* **Amazon EventBridge:** Acts as the central nervous system, routing events to downstream consumers (Notifications, Data Lake, Audit) via smart rules.



---

## Key Features

* **Strong Consistency:** Guaranteed by DynamoDB ACID Transactions.
* **Event-Driven Evolution:** Fully decoupled architecture using EventBridge.
* **FinOps Optimized:** On-demand scaling with AWS Free Tier compatibility (Zero cost when idle).
* **Least Privilege Security:** Granular IAM Policies for every Lambda function.
* **Distributed Tracing:** Full observability with AWS X-Ray and CloudWatch.

---

## Project Structure


├── src/
    ├── handlers/       # Lambda entry points (Processor, Poller, Notifier)
    ├── lib/            # Shared business logic & DB helpers
    └── events/         # Mock payloads for cloud testing
├── docs/               # Architectural diagrams
├── template.yaml       # AWS SAM Infrastructure as Code (IaC)
└── package.json        # Dependencies (Minimal & Clean)

## Development & CI/CD

This project uses **GitHub Actions** for Continuous Integration. Every push to the `main` branch or Pull Request triggers:
* **Linting:** To ensure code quality (AWS SAM/CloudFormation).
* **Unit Testing:** Using Jest and `aws-sdk-client-mock`.
* **Environment:** Node.js 24.x (LTS).

To run tests locally:
```bash
npm test
```