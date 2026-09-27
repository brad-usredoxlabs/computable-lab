# Computable Lab Party / Request Schema Specification

## Purpose

Computable Lab should support commercial laboratory workflows such as **test-your-food.com** without assuming that every laboratory has customers, orders, payments, or retail transactions.

The core Computable Lab data model should therefore use **general laboratory primitives**, while allowing applications such as Test Your Food to define commercial specializations.

The central rule is:

> **Computable Lab core models laboratory relationships and work requests generically. Applications may specialize those records into customer/order concepts.**

This allows the same Computable Lab installation architecture to support:

- commercial testing laboratories;
- academic research laboratories;
- shared core facilities;
- internal R&D laboratories;
- manufacturing and QC laboratories;
- clinical or translational research groups;
- contract research laboratories;
- collaborative multi-institution projects.

---

# 1. Core abstraction

The preferred generic graph is:

```text
PARTY
  |
  v
REQUEST
  |
  v
SAMPLE
  |
  v
WORK / EXPERIMENT
  |
  v
RESULT
  |
  v
REPORT
```

The two new core concepts are:

```text
party
request
```

These should be generic Computable Lab record types.

Commercial concepts such as `customer` and `order` should be specializations of them rather than assumptions built into the entire platform.

---

# 2. Party

A `party` represents a person or organization participating in, requesting, owning, receiving, supplying, or otherwise relating to laboratory work.

Example:

```yaml
type: party
id: PARTY-0018

kind: organization
name: Acme Nutrition LLC

contacts:
  - name: Jane Smith
    email: jane@example.com

status: active
```

A party may represent:

```text
person
organization
research group
department
institution
company
collaborator
supplier
customer
sponsor
investigator
```

The exact role should be represented by relationships or specialized record types rather than by assuming every party is a customer.

---

# 3. Party specialization

Applications may define domain-specific records that extend or specialize `party`.

For Test Your Food:

```yaml
type: customer
extends: party

id: CUST-0018
name: Jane Smith
```

Conceptually:

```text
party
  |
  +-- person
  +-- organization
  +-- customer
  +-- supplier
  +-- collaborator
  +-- investigator
```

A customer is therefore a kind of party, but Computable Lab itself does not require every installation to use customer records.

---

# 4. Request

A `request` represents a request for laboratory work.

Example:

```yaml
type: request
id: REQ-2026-00427

requester: PARTY-0018

requested_services:
  - fatty_acid_profile

samples:
  - SMP-2026-01231

status: accepted
```

The request answers:

> What work has someone asked the laboratory to perform?

It should not imply a commercial transaction.

A request may originate from:

```text
external customer
principal investigator
internal scientist
production group
quality department
collaborating laboratory
clinical study
research project
automated workflow
```

---

# 5. Request specialization

Applications can specialize `request` for their own workflows.

Examples:

```text
request
  |
  +-- order
  +-- work_request
  +-- internal_request
  +-- study_request
  +-- service_request
```

For Test Your Food:

```yaml
type: order
extends: request

id: ORD-2026-00427
customer: CUST-0018

payment_status: paid
kit_status: shipped
status: awaiting_sample
```

The commercial fields belong to the `order` specialization rather than the generic `request`.

---

# 6. Why not make customer/order universal?

Most laboratories do not naturally describe their workflow as:

```text
customer -> order -> test
```

Examples:

### Academic laboratory

```text
investigator
    |
    v
study request
    |
    v
samples
    |
    v
experiment
```

### Core facility

```text
research group
    |
    v
service request
    |
    v
submitted samples
    |
    v
instrument run
```

### Manufacturing QC

```text
production lot
    |
    v
internal test request
    |
    v
QC sample
    |
    v
assay
```

### Test Your Food

```text
customer
    |
    v
order
    |
    v
barcoded sample
    |
    v
laboratory analysis
```

All of these fit the same generic Computable Lab graph:

```text
PARTY -> REQUEST -> SAMPLE -> WORK -> RESULT
```

---

# 7. Test-Your-Food specialization

For **test-your-food.com**, the user-facing vocabulary should remain familiar:

```text
Customer
Order
Sample
Report
```

Internally these map to the general Computable Lab concepts:

```text
Test Your Food        Computable Lab Core

Customer       --->   Party
Order          --->   Request
Sample         --->   Sample
Test           --->   Requested Service / Work
Report         --->   Report
```

This allows the Test Your Food application to behave like a normal consumer service without forcing those commercial semantics onto other Computable Lab installations.

---

# 8. Customer record

A Test Your Food customer record should be deliberately thin.

Example:

```yaml
type: customer
extends: party

id: CUST-0018

name: Jane Smith

contacts:
  - type: email
    value: jane@example.com

status: active

source:
  system: test-your-food.com
  remote_id: cus_8d19
```

The customer record represents persistent identity.

Changing transactional information should not normally be stored on the customer.

For example, these belong to the order:

```text
requested assay
sample type
sample description
turnaround time
shipping state
reporting requirements
payment
special instructions
```

---

# 9. Order record

The Test Your Food `order` is a specialization of `request`.

Example:

```yaml
type: order
extends: request

id: ORD-2026-00427

customer: CUST-0018

created_at: 2026-09-26T17:42:31-04:00

requested_services:
  - id: ORDL-001
    service: fatty_acid_profile
    quantity: 1

payment:
  status: paid

sample_kit:
  status: shipped

status: awaiting_sample

source:
  system: test-your-food.com
  remote_id: ord_98af
  remote_revision: 4
```

The order answers:

> What did the customer request from the laboratory?

It should remain distinct from records describing what the laboratory actually did.

---

# 10. Requested service

A request or order may contain one or more requested services.

Example:

```yaml
type: requested_service
id: ORDL-2026-00427-01

request: ORD-2026-00427

service: fatty_acid_profile
matrix: food
sample_count: 1

requested_reporting:
  basis: percent_total_fatty_acids
```

Do not assume:

```text
1 request = 1 sample = 1 assay
```

Instead support:

```text
REQUEST
   |
   +-- REQUESTED SERVICE
   +-- REQUESTED SERVICE
   |
   +-- SAMPLE
   +-- SAMPLE
   +-- SAMPLE
```

---

# 11. Barcode sample workflow for Test Your Food

When a customer places an order on test-your-food.com, they receive a physical collection package.

The package contains a uniquely barcoded sample tube.

The intended workflow is:

```text
Customer places order
        |
        v
Collection kit shipped
        |
        v
Customer receives barcoded tube
        |
        v
Customer collects sample
        |
        v
Customer scans barcode on test-your-food.com
        |
        v
Customer describes sample
        |
        v
Barcode + description associated with order
        |
        v
Customer ships tube to lab
        |
        v
Lab scans same barcode
        |
        v
Computable Lab resolves request/order
        |
        v
Physical sample is accessioned
```

The customer scan and laboratory scan represent different events.

### Customer scan

Means:

> This is the physical tube I used for the sample associated with this order.

Example:

```yaml
type: sample_registration

order: ORD-2026-00427
barcode: TYF-9F7A21

customer_description:
  type: food
  description: Extra virgin olive oil from opened bottle

registered_at: 2026-09-27T16:18:04-04:00
```

### Laboratory scan

Means:

> This physical tube has entered laboratory custody.

Example:

```yaml
type: sample_receipt

barcode: TYF-9F7A21

received_at: 2026-09-29T09:14:22-04:00
received_by: person:brad

condition:
  acceptable: true
```

The receipt event connects the physical tube to the laboratory sample record.

---

# 12. Laboratory sample record

After receipt, Computable Lab creates or activates the laboratory sample record.

Example:

```yaml
type: sample
id: SMP-2026-01231

request: ORD-2026-00427

barcode: TYF-9F7A21

submitted_description:
  type: food
  description: Extra virgin olive oil from opened bottle

receipt:
  timestamp: 2026-09-29T09:14:22-04:00
  received_by: person:brad

condition_on_receipt:
  acceptable: true

status: accessioned
```

The physical barcode should remain linked throughout subsequent laboratory transformations:

```text
BARCODED SAMPLE
      |
      v
LAB SAMPLE
      |
      +-- aliquot
      |
      +-- extraction
      |
      +-- derivatization
      |
      +-- assay run
      |
      +-- raw data
      |
      +-- result
```

---

# 13. QMS boundary

Test Your Food records customer-facing intent and submission information.

Computable Lab records laboratory truth.

```text
TEST-YOUR-FOOD.COM

CUSTOMER
    |
    v
ORDER
    |
    v
REQUESTED SERVICE
    |
    v
BARCODE REGISTRATION
    |
    v
PHYSICAL SAMPLE

------------------------------
      LABORATORY BOUNDARY
------------------------------

    |
    v
SAMPLE RECEIPT
    |
    v
ACCESSION
    |
    v
CONTRACT / REQUEST REVIEW
    |
    v
SAMPLE / ALIQUOT / EXTRACT
    |
    v
PROTOCOL / ASSAY RUN
    |
    v
RAW DATA
    |
    v
ANALYSIS
    |
    v
QC
    |
    v
RESULT
    |
    v
TECHNICAL REVIEW
    |
    v
REPORT
```

---

# 14. Requested, performed, reported

Computable Lab should explicitly preserve three distinct layers.

## Requested

What was requested?

```text
party
request
requested_service
submitted sample description
```

## Performed

What actually happened in the laboratory?

```text
sample receipt
accession
sample transformations
method
protocol
equipment
reagents
operator
raw data
analysis
QC
deviations
```

## Reported

What was ultimately communicated?

```text
result
technical review
report
report revision
release
```

The fundamental graph pattern is:

```text
REQUESTED
    |
    v
RECEIVED
    |
    v
PERFORMED
    |
    v
REPORTED
```

This should be a first-class Computable Lab concept.

---

# 15. Git-native implementation

Computable Lab is Git-native.

Git should preserve the durable record history, but it should not be the primary synchronization protocol between Test Your Food and Computable Lab.

Preferred architecture:

```text
test-your-food.com
      |
      | HTTPS events
      v
Computable Lab sync worker
      |
      v
domain validation
      |
      v
YAML record graph
      |
      v
Git commit
```

The integration principle is:

> **HTTP synchronizes meaning. Git preserves history.**

Test Your Food should not directly push to or modify the Computable Lab repository.

Computable Lab should remain the sole writer of laboratory/QMS records.

---

# 16. Example Git repository layout

A possible repository structure is:

```text
records/
  parties/
    PARTY-0018.yaml

  customers/
    CUST-0018.yaml

  requests/
    REQ-2026-00172.yaml

  orders/
    ORD-2026-00427.yaml

  requested-services/
    ORDL-2026-00427-01.yaml

  samples/
    SMP-2026-01231.yaml

  sample-receipts/
    RECEIPT-2026-00911.yaml

  contract-reviews/
    CR-2026-00427.yaml

  runs/
    RUN-2026-00918.yaml

  reports/
    RPT-2026-00331.yaml
```

Implementations may instead store specialized types together if Computable Lab's schema registry provides enough metadata to distinguish them.

---

# 17. Schema inheritance versus semantic typing

The examples in this specification use syntax such as:

```yaml
type: customer
extends: party
```

and:

```yaml
type: order
extends: request
```

This is conceptual.

The implementation does not require object-oriented schema inheritance.

Computable Lab may implement this through:

- schema composition;
- JSON Schema `$ref`;
- tagged record types;
- traits;
- ontology relationships;
- graph relationships;
- reusable field groups.

The important semantic relationships are:

```text
customer IS-A party
order IS-A request
```

The physical serialization mechanism can be chosen according to the existing Computable Lab schema system.

---

# 18. Core versus application schemas

Recommended ownership:

## Computable Lab core

```text
party
request
requested_service
sample
sample_receipt
work
result
report
```

## Test Your Food application/domain package

```text
customer
order
payment
sample_kit
shipment
barcode_registration
customer portal state
```

The Test Your Food schemas may extend core schemas but should not force their commercial fields into core Computable Lab records.

---

# 19. Design principle

The core abstraction should remain:

> **A party requests work from a laboratory.**

For a commercial laboratory such as Test Your Food, that becomes:

> **A customer places an order.**

For an academic core facility:

> **An investigator submits a service request.**

For internal QC:

> **A production group submits an internal test request.**

All three should compile into the same general Computable Lab relationship:

```text
PARTY -> REQUEST -> SAMPLE -> WORK -> RESULT -> REPORT
```

This gives Computable Lab a general laboratory ontology while allowing each application to expose vocabulary appropriate to its users.

---

# 20. Summary recommendation

Implement `party` and `request` as general first-class Computable Lab records.

Implement `customer` and `order` as Test Your Food specializations.

Do not make commercial concepts mandatory across Computable Lab.

Keep the laboratory graph generic:

```text
PARTY
  -> REQUEST
  -> SAMPLE
  -> WORK
  -> RESULT
  -> REPORT
```

Allow Test Your Food to present the commercial version:

```text
CUSTOMER
  -> ORDER
  -> BARCODED SAMPLE
  -> TEST
  -> RESULT
  -> REPORT
```

This preserves a clean architecture for Computable Lab while supporting Test Your Food as a first-class commercial testing application.
