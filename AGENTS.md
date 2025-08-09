# Claude Code Specialized Agents

This document lists all available specialized agents and when to use them.

## 🚨 Critical Response Agents

### incident-responder
**Use IMMEDIATELY when production issues occur**
- Handles production incidents with urgency and precision
- Coordinates debugging, implements fixes, and documents post-mortems
- **When to use**: Server down, critical bugs, data loss, security breaches

### debugger
**Use proactively when encountering any issues**
- Debugging specialist for errors, test failures, and unexpected behavior
- **When to use**: JavaScript errors, failed tests, unexpected app behavior

### error-detective
**Search logs and codebases for error patterns**
- Correlates errors across systems and identifies root causes
- **When to use**: Investigating production errors, analyzing logs, finding patterns

## 🏗️ Architecture & Code Quality

### architect-reviewer
**Use after structural changes, new services, or API modifications**
- Reviews code changes for architectural consistency and patterns
- Ensures SOLID principles, proper layering, and maintainability

### Have 
**Use immediately after writing or modifying code**
- Expert code review for quality, security, and maintainability
- **Proactive use recommended**

### backend-architect
**Use when creating new backend services or APIs**
- Designs RESTful APIs, microservice boundaries, and database schemas
- Reviews system architecture for scalability and performance

### dx-optimizer
**Use when setting up projects or after team feedback**
- Developer Experience specialist improving tooling, setup, and workflows
- **Use proactively** when development friction is noticed

## 💻 Language Specialists

### javascript-pro
**Use for complex JavaScript patterns, async debugging, or optimization**
- Masters modern JavaScript with ES6+, async patterns, and Node.js APIs
- Handles promises, event loops, and browser/Node compatibility

### python-pro
**Use for Python refactoring, optimization, or complex features**
- Write idiomatic Python with decorators, generators, and async/await
- Optimizes performance, implements design patterns

### frontend-developer
**Use when creating UI components or fixing frontend issues**
- Builds React components, implements responsive layouts
- Optimizes frontend performance and ensures accessibility

### golang-pro
**Use for Go concurrency issues or performance optimization**
- Write idiomatic Go code with goroutines, channels, and interfaces

### rust-pro
**Use for Rust memory safety, performance optimization, or systems programming**
- Write idiomatic Rust with ownership patterns, lifetimes, and trait implementations

### cpp-pro
**Use for C++ refactoring, memory safety, or complex patterns**
- Write idiomatic C++ with modern features, RAII, smart pointers

### c-pro
**Use for C optimization, memory issues, or system programming**
- Write efficient C code with proper memory management

### php-pro
**Use for high-performance PHP applications**
- Write idiomatic PHP with generators, iterators, and modern OOP features

## 🚀 Infrastructure & DevOps

### cloud-architect
**Use for cloud infrastructure, cost optimization, or migration planning**
- Designs AWS/Azure/GCP infrastructure, implements Terraform IaC

### deployment-engineer
**Use when setting up deployments, containers, or CI/CD workflows**
- Configures CI/CD pipelines, Docker containers, and cloud deployments

### devops-troubleshooter
**Use for production debugging or system outages**
- Debugs production issues, analyzes logs, and fixes deployment failures

### network-engineer
**Use for connectivity issues, network optimization, or protocol debugging**
- Debugs network connectivity, configures load balancers

### terraform-specialist
**Use for Terraform modules, state issues, or IaC automation**
- Writes advanced Terraform modules, manages state files

### performance-engineer
**Use for performance issues or optimization tasks**
- Profiles applications, optimizes bottlenecks, implements caching

## 🗄️ Database & Data

### database-optimizer
**Use for database performance issues or schema optimization**
- Optimizes SQL queries, designs efficient indexes
- Solves N+1 problems, handles slow queries

### database-admin
**Use for database setup, operational issues, or recovery**
- Manages database operations, backups, replication, monitoring

### sql-pro
**Use for query optimization, complex joins, or database design**
- Writes complex SQL queries, optimizes execution plans

### data-engineer
**Use for data pipeline design or analytics infrastructure**
- Builds ETL pipelines, data warehouses, streaming architectures

### data-scientist
**Use for data analysis tasks and queries**
- Data analysis expert for SQL queries, BigQuery operations

## 🔒 Security

### security-auditor
**Use for security reviews, auth flows, or vulnerability fixes**
- Reviews code for vulnerabilities, implements secure authentication
- Handles JWT, OAuth2, CORS, CSP, and encryption

### legal-advisor
**Use for legal documentation, compliance texts, or regulatory requirements**
- Drafts privacy policies, terms of service, disclaimers

## 🤖 AI & Machine Learning

### ai-engineer
**Use for LLM features, chatbots, or AI-powered applications**
- Builds LLM applications, RAG systems, and prompt pipelines

### ml-engineer
**Use for ML model integration or production deployment**
- Implements ML pipelines, model serving, and feature engineering

### mlops-engineer
**Use for ML infrastructure, experiment management, or pipeline automation**
- Builds ML pipelines, experiment tracking, and model registries

### prompt-engineer
**Use when building AI features or improving agent performance**
- Optimizes prompts for LLMs and AI systems

## 🧪 Testing

### test-automator
**Use PROACTIVELY for test coverage improvement or test automation setup**
- Creates comprehensive test suites with unit, integration, and e2e tests
- Sets up CI pipelines, mocking strategies, and test data

## 🎨 Frontend & Mobile

### mobile-developer
**Use for mobile features, cross-platform code, or app optimization**
- Develops React Native or Flutter apps with native integrations

### graphql-architect
**Use for GraphQL API design or performance issues**
- Designs GraphQL schemas, resolvers, and federation

## 🔧 Specialized Tools

### api-documenter
**Use for API documentation or client library generation**
- Creates OpenAPI/Swagger specs, generates SDKs

### payment-integration
**Use when implementing payments, billing, or subscription features**
- Integrates Stripe, PayPal, and payment processors

### legacy-modernizer
**Use for legacy system updates, framework migrations, or technical debt reduction**
- Refactors legacy codebases, migrates outdated frameworks

### search-specialist
**Use for deep research, information gathering, or trend analysis**
- Expert web researcher using advanced search techniques

## 💼 Business & Content

### business-analyst
**Use for business metrics or investor updates**
- Analyzes metrics, creates reports, and tracks KPIs

### content-marketer
**Use for marketing content or social media posts**
- Writes blog posts, social media content, and email newsletters

### sales-automator
**Use for sales outreach or lead nurturing**
- Drafts cold emails, follow-ups, and proposal templates

### customer-support
**Use for customer inquiries or support documentation**
- Handles support tickets, FAQ responses, creates help docs

## 🔄 Multi-Agent & Context

### context-manager
**MUST BE USED for projects exceeding 10k tokens**
- Manages context across multiple agents and long-running tasks
- Use when coordinating complex multi-agent workflows

### general-purpose
**Use when you're not confident about finding specific matches**
- General-purpose agent for researching complex questions
- Searches for code and executes multi-step tasks

---

## 🎯 Quick Decision Guide

**Immediate Production Issues** → incident-responder
**Code Problems** → debugger + error-detective  
**New Features** → backend-architect + frontend-developer
**Performance Issues** → performance-engineer + database-optimizer
**Security Concerns** → security-auditor
**UI/UX Work** → frontend-developer + mobile-developer
**Infrastructure** → cloud-architect + deployment-engineer
**Complex Logic** → [language]-pro (javascript-pro, python-pro, etc.)
**Large Projects** → context-manager

## 💡 Pro Tips

1. **Use multiple agents concurrently** when possible for faster results
2. **Be proactive** - use agents before problems escalate  
3. **Combine specialized agents** for complex tasks
4. **Always use context-manager** for large projects
5. **Launch debugger + error-detective together** for thorough issue investigation

---

*Last Updated: 2025-08-07*
*Keep this file handy for quick agent selection!*