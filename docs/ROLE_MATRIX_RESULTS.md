# Pilot role matrix results

Read-only browser run against the already-running local pilot. Login is the only POST; every page request was navigation or GET.
Account identifiers are ordinal and role only. Credentials, tokens, and cookies are not included.

| account | sidebar entries | denied URL / page | API status | data shown? | language |
|---|---|---|---|---|---|
| Pilot 01 (owner_ceo) | Dashboard, Projects, Inventory, Procurement comparison, Clients, Suppliers, Equipment, HR, Expenses, Invoices & Payments, Legal, Approvals, My Actions, Administration | (sidebar) | captured | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard/alerts=200; /dashboard=200; /dashboard/alerts=200; /dashboard/role=200; /finance/summary=200; /dashboard/overview=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /finance/summary=200; /invoices=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/my-requests=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | /organizations=200 | n/a | en |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | en |
| Pilot 01 (owner_ceo) | لوحة التحكم, المشاريع, المخزون, مقارنة المشتريات, العملاء, الموردين, المعدات, الموارد البشرية, المصروفات, الفواتير والمدفوعات, القسم القانوني, الموافقات, مهامي, الإدارة | (sidebar) | captured | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard/alerts=200; /dashboard=200; /dashboard/overview=200; /finance/summary=200; /dashboard/role=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/my-requests=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | /organizations=200 | n/a | ar |
| Pilot 01 (owner_ceo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | ar |
| Pilot 02 (coo) | Dashboard, Projects, Inventory, Procurement comparison, Clients, Suppliers, Equipment, HR, Expenses, Invoices & Payments, Legal, Approvals, My Actions, Administration | (sidebar) | captured | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard/alerts=200; /dashboard=200; /dashboard/overview=200; /dashboard/role=200; /finance/summary=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/my-requests=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | /organizations=200 | n/a | en |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | en |
| Pilot 02 (coo) | لوحة التحكم, المشاريع, المخزون, مقارنة المشتريات, العملاء, الموردين, المعدات, الموارد البشرية, المصروفات, الفواتير والمدفوعات, القسم القانوني, الموافقات, مهامي, الإدارة | (sidebar) | captured | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=200; /dashboard/role=200; /dashboard/overview=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /finance/summary=200; /invoices=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/my-requests=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | /organizations=200 | n/a | ar |
| Pilot 02 (coo) | /admin/organizations, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | ar |
| Pilot 03 (projects_director) | Dashboard, Projects, Inventory, Clients, Invoices & Payments, Approvals, My Actions | (sidebar) | captured | n/a | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/overview=200; /dashboard/alerts=200; /dashboard/role=200 | n/a | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /inventory | /items=200 | n/a | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /clients | /clients=200 | n/a | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=200 | n/a | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /approvals | /approvals/my-requests=200 | n/a | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 03 (projects_director) | لوحة التحكم, المشاريع, المخزون, العملاء, الفواتير والمدفوعات, الموافقات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /inventory | /items=200 | n/a | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /clients | /clients=200 | n/a | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=200 | n/a | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /approvals | /approvals/my-requests=200 | n/a | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 03 (projects_director) | /approvals, /clients, /dashboard, /inventory, /invoices, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 04 (construction_manager) | Dashboard, Projects, Inventory, My Actions | (sidebar) | captured | n/a | en |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=403; /dashboard/overview=200; /dashboard/role=200 | n/a | en |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /inventory | /items=200 | n/a | en |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 04 (construction_manager) | لوحة التحكم, المشاريع, المخزون, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /inventory | /items=200 | n/a | ar |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 04 (construction_manager) | /dashboard, /inventory, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 05 (project_manager) | Dashboard, Projects, Inventory, Procurement comparison, Clients, Suppliers, Equipment, HR, Expenses, Invoices & Payments, Legal, Approvals, My Actions | (sidebar) | captured | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard/alerts=200; /dashboard=200; /finance/summary=200; /dashboard/overview=200; /dashboard/role=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/pending=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | en |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | en |
| Pilot 05 (project_manager) | لوحة التحكم, المشاريع, المخزون, مقارنة المشتريات, العملاء, الموردين, المعدات, الموارد البشرية, المصروفات, الفواتير والمدفوعات, القسم القانوني, الموافقات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/pending=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | ar |
| Pilot 05 (project_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | ar |
| Pilot 06 (site_manager) | Dashboard, Projects, My Actions | (sidebar) | captured | n/a | en |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/role=200; /dashboard/overview=200 | n/a | en |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | en |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 06 (site_manager) | لوحة التحكم, المشاريع, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /dashboard | /finance/summary=403; /dashboard=200; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | ar |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 06 (site_manager) | /dashboard, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 07 (site_engineer) | Projects, My Actions | (sidebar) | captured | n/a | en |
| Pilot 07 (site_engineer) | /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 07 (site_engineer) | /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 07 (site_engineer) | /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 07 (site_engineer) | /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 07 (site_engineer) | /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 07 (site_engineer) | /my-actions, /projects | /settings | no API response | no | en |
| Pilot 07 (site_engineer) | المشاريع, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 07 (site_engineer) | /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 07 (site_engineer) | /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 07 (site_engineer) | /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 07 (site_engineer) | /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 07 (site_engineer) | /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 07 (site_engineer) | /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 08 (planning_engineer) | Dashboard, Projects, My Actions | (sidebar) | captured | n/a | en |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=403; /dashboard/role=200; /dashboard/overview=200 | n/a | en |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | en |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 08 (planning_engineer) | لوحة التحكم, المشاريع, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | ar |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 08 (planning_engineer) | /dashboard, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 09 (technical_office_engineer) | Projects, My Actions | (sidebar) | captured | n/a | en |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | en |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /settings | no API response | no | en |
| Pilot 09 (technical_office_engineer) | المشاريع, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 09 (technical_office_engineer) | /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 10 (quantity_surveyor) | Projects, Invoices & Payments, My Actions | (sidebar) | captured | n/a | en |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=200 | n/a | en |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 10 (quantity_surveyor) | المشاريع, الفواتير والمدفوعات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=200 | n/a | ar |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 10 (quantity_surveyor) | /invoices, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 11 (commercial_manager) | Dashboard, Projects, Clients, Invoices & Payments, My Actions | (sidebar) | captured | n/a | en |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /dashboard | /finance/summary=403; /dashboard/alerts=200; /dashboard=200; /dashboard/role=200; /dashboard/overview=200 | n/a | en |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /clients | /clients=200 | n/a | en |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=200 | n/a | en |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 11 (commercial_manager) | لوحة التحكم, المشاريع, العملاء, الفواتير والمدفوعات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /clients | /clients=200 | n/a | ar |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=200 | n/a | ar |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 11 (commercial_manager) | /clients, /dashboard, /invoices, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 12 (contracts_manager) | Dashboard, Projects, Clients, Invoices & Payments, Legal, My Actions | (sidebar) | captured | n/a | en |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/overview=200; /dashboard/alerts=200; /dashboard/role=200 | n/a | en |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /clients | /clients=200 | n/a | en |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=200 | n/a | en |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /legal | /legal=200 | n/a | en |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 12 (contracts_manager) | لوحة التحكم, المشاريع, العملاء, الفواتير والمدفوعات, القسم القانوني, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /dashboard | /finance/summary=403; /dashboard=200; /dashboard/role=200; /dashboard/alerts=200; /dashboard/overview=200 | n/a | ar |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /clients | /clients=200 | n/a | ar |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=200 | n/a | ar |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /legal | /legal=200 | n/a | ar |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /my-actions | /actions/my=200; /notifications=200 | n/a | ar |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 12 (contracts_manager) | /clients, /dashboard, /invoices, /legal, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 13 (procurement_manager) | Dashboard, Projects, Inventory, Procurement comparison, Suppliers, Invoices & Payments, My Actions | (sidebar) | captured | n/a | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /finance/summary=403; /dashboard=200; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /finance/summary=403; /invoices=200 | n/a | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=403 | no | en |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | en |
| Pilot 13 (procurement_manager) | لوحة التحكم, المشاريع, المخزون, مقارنة المشتريات, الموردين, الفواتير والمدفوعات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=403; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /finance/summary=403; /invoices=200 | n/a | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=403 | no | ar |
| Pilot 13 (procurement_manager) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | ar |
| Pilot 14 (procurement_officer) | Inventory, Procurement comparison, Suppliers, My Actions | (sidebar) | captured | n/a | en |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /admin/organizations | no API response | no | en |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /hr | /hr/employees=403 | no | en |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /settings | no API response | no | en |
| Pilot 14 (procurement_officer) | المخزون, مقارنة المشتريات, الموردين, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /admin/organizations | no API response | no | ar |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /hr | /hr/employees=403 | no | ar |
| Pilot 14 (procurement_officer) | /inventory, /my-actions, /procurement/comparison, /suppliers | /settings | no API response | no | ar |
| Pilot 15 (finance_manager) | Dashboard, Projects, Inventory, Procurement comparison, Clients, Suppliers, Equipment, HR, Expenses, Invoices & Payments, Legal, Approvals, My Actions | (sidebar) | captured | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /dashboard/role=200; /dashboard/overview=200; /finance/summary=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/pending=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | en |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | en |
| Pilot 15 (finance_manager) | لوحة التحكم, المشاريع, المخزون, مقارنة المشتريات, العملاء, الموردين, المعدات, الموارد البشرية, المصروفات, الفواتير والمدفوعات, القسم القانوني, الموافقات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=200; /dashboard/role=200; /dashboard/overview=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/pending=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | ar |
| Pilot 15 (finance_manager) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | ar |
| Pilot 16 (accountant_ar) | Dashboard, Clients, Invoices & Payments, Approvals, My Actions | (sidebar) | captured | n/a | en |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /dashboard | /dashboard=200; /dashboard/alerts=200; /dashboard/role=200; /finance/summary=200; /dashboard/overview=200 | n/a | en |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /clients | /clients=200 | n/a | en |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /invoices | /invoices=200; /finance/summary=200 | n/a | en |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /approvals | /approvals/my-requests=200 | n/a | en |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /admin/organizations | no API response | no | en |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /hr | /hr/employees=403 | no | en |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /settings | no API response | no | en |
| Pilot 16 (accountant_ar) | لوحة التحكم, العملاء, الفواتير والمدفوعات, الموافقات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /dashboard | /dashboard=200; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200; /finance/summary=200 | n/a | ar |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /clients | /clients=200 | n/a | ar |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /invoices | /invoices=200; /finance/summary=200 | n/a | ar |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /approvals | /approvals/my-requests=200 | n/a | ar |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /admin/organizations | no API response | no | ar |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /hr | /hr/employees=403 | no | ar |
| Pilot 16 (accountant_ar) | /approvals, /clients, /dashboard, /invoices, /my-actions | /settings | no API response | no | ar |
| Pilot 17 (accountant_ap) | Dashboard, Inventory, Procurement comparison, Suppliers, Expenses, Approvals, My Actions | (sidebar) | captured | n/a | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /dashboard | /dashboard/alerts=200; /dashboard=200; /dashboard/overview=200; /finance/summary=200; /dashboard/role=200 | n/a | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /expenses | /expenses=200 | n/a | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /approvals | /approvals/my-requests=200 | n/a | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /admin/organizations | no API response | no | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /invoices | /invoices=403; /finance/summary=200 | no | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /hr | /hr/employees=403 | no | en |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /settings | no API response | no | en |
| Pilot 17 (accountant_ap) | لوحة التحكم, المخزون, مقارنة المشتريات, الموردين, المصروفات, الموافقات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /expenses | /expenses=200 | n/a | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /approvals | /approvals/my-requests=200 | n/a | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /admin/organizations | no API response | no | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /invoices | /invoices=403; /finance/summary=200 | no | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /hr | /hr/employees=403 | no | ar |
| Pilot 17 (accountant_ap) | /approvals, /dashboard, /expenses, /inventory, /my-actions, /procurement/comparison, /suppliers | /settings | no API response | no | ar |
| Pilot 18 (storekeeper) | Projects, Inventory, My Actions | (sidebar) | captured | n/a | en |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /inventory | /items=200 | n/a | en |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 18 (storekeeper) | المشاريع, المخزون, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /inventory | /items=200 | n/a | ar |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 18 (storekeeper) | /inventory, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 19 (qa_qc_manager) | Dashboard, Projects, My Actions | (sidebar) | captured | n/a | en |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /dashboard | /finance/summary=403; /dashboard=200; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | en |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | en |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 19 (qa_qc_manager) | لوحة التحكم, المشاريع, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /dashboard | /finance/summary=403; /dashboard/alerts=200; /dashboard=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 19 (qa_qc_manager) | /dashboard, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 20 (hse_manager) | Dashboard, Projects, My Actions | (sidebar) | captured | n/a | en |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/role=200; /dashboard/overview=200 | n/a | en |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | en |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 20 (hse_manager) | لوحة التحكم, المشاريع, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /dashboard | /dashboard/alerts=200; /finance/summary=403; /dashboard=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 20 (hse_manager) | /dashboard, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 21 (document_controller) | Projects, My Actions | (sidebar) | captured | n/a | en |
| Pilot 21 (document_controller) | /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 21 (document_controller) | /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 21 (document_controller) | /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 21 (document_controller) | /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 21 (document_controller) | /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 21 (document_controller) | /my-actions, /projects | /settings | no API response | no | en |
| Pilot 21 (document_controller) | المشاريع, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 21 (document_controller) | /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 21 (document_controller) | /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 21 (document_controller) | /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 21 (document_controller) | /my-actions, /projects | /invoices | /finance/summary=403; /invoices=403 | no | ar |
| Pilot 21 (document_controller) | /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 21 (document_controller) | /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 22 (equipment_manager) | Dashboard, Projects, Inventory, Procurement comparison, Equipment, My Actions | (sidebar) | captured | n/a | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /inventory | /items=200 | n/a | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /procurement/comparison | no API response | n/a | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /assets | /assets=200 | n/a | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /my-actions | /actions/my=200; /notifications=200 | n/a | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /admin/organizations | no API response | no | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /settings | no API response | no | en |
| Pilot 22 (equipment_manager) | لوحة التحكم, المشاريع, المخزون, مقارنة المشتريات, المعدات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /dashboard | /dashboard/alerts=200; /finance/summary=403; /dashboard=200; /dashboard/role=200; /dashboard/overview=200 | n/a | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /inventory | /items=200 | n/a | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /procurement/comparison | no API response | n/a | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /assets | /assets=200 | n/a | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /my-actions | /actions/my=200; /notifications=200 | n/a | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /admin/organizations | no API response | no | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 22 (equipment_manager) | /assets, /dashboard, /inventory, /my-actions, /procurement/comparison, /projects | /settings | no API response | no | ar |
| Pilot 23 (hr_manager) | Dashboard, Projects, HR, My Actions | (sidebar) | captured | n/a | en |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/role=200; /dashboard/overview=200 | n/a | en |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /hr | /hr/employees=200 | n/a | en |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 23 (hr_manager) | لوحة التحكم, المشاريع, الموارد البشرية, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /dashboard | /finance/summary=403; /dashboard=200; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /hr | /hr/employees=200 | n/a | ar |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 23 (hr_manager) | /dashboard, /hr, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 24 (business_development) | Dashboard, Projects, Clients, Legal, My Actions | (sidebar) | captured | n/a | en |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/overview=200; /dashboard/role=200 | n/a | en |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /clients | /clients=200 | n/a | en |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /legal | /legal=200 | n/a | en |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /admin/organizations | no API response | no | en |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /hr | /hr/employees=403 | no | en |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /settings | no API response | no | en |
| Pilot 24 (business_development) | لوحة التحكم, المشاريع, العملاء, القسم القانوني, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /dashboard | /dashboard/alerts=200; /dashboard=200; /dashboard/overview=200; /dashboard/role=200; /finance/summary=403 | n/a | ar |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /clients | /clients=200 | n/a | ar |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /legal | /legal=200 | n/a | ar |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /admin/organizations | no API response | no | ar |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 24 (business_development) | /clients, /dashboard, /legal, /my-actions, /projects | /settings | no API response | no | ar |
| Pilot 25 (client_executive) | Projects | (sidebar) | captured | n/a | en |
| Pilot 25 (client_executive) | /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 25 (client_executive) | /projects | /admin/organizations | no API response | no | en |
| Pilot 25 (client_executive) | /projects | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 25 (client_executive) | /projects | /hr | /hr/employees=403 | no | en |
| Pilot 25 (client_executive) | /projects | /settings | no API response | no | en |
| Pilot 25 (client_executive) | المشاريع | (sidebar) | captured | n/a | ar |
| Pilot 25 (client_executive) | /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 25 (client_executive) | /projects | /admin/organizations | no API response | no | ar |
| Pilot 25 (client_executive) | /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 25 (client_executive) | /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 25 (client_executive) | /projects | /settings | no API response | no | ar |
| Pilot 26 (client_reviewer) | Projects | (sidebar) | captured | n/a | en |
| Pilot 26 (client_reviewer) | /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | en |
| Pilot 26 (client_reviewer) | /projects | /admin/organizations | no API response | no | en |
| Pilot 26 (client_reviewer) | /projects | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 26 (client_reviewer) | /projects | /hr | /hr/employees=403 | no | en |
| Pilot 26 (client_reviewer) | /projects | /settings | no API response | no | en |
| Pilot 26 (client_reviewer) | المشاريع | (sidebar) | captured | n/a | ar |
| Pilot 26 (client_reviewer) | /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 26 (client_reviewer) | /projects | /admin/organizations | no API response | no | ar |
| Pilot 26 (client_reviewer) | /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 26 (client_reviewer) | /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 26 (client_reviewer) | /projects | /settings | no API response | no | ar |
| Pilot 27 (pmc_manager) | Projects | (sidebar) | captured | n/a | en |
| Pilot 27 (pmc_manager) | /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | en |
| Pilot 27 (pmc_manager) | /projects | /admin/organizations | no API response | no | en |
| Pilot 27 (pmc_manager) | /projects | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 27 (pmc_manager) | /projects | /hr | /hr/employees=403 | no | en |
| Pilot 27 (pmc_manager) | /projects | /settings | no API response | no | en |
| Pilot 27 (pmc_manager) | المشاريع | (sidebar) | captured | n/a | ar |
| Pilot 27 (pmc_manager) | /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 27 (pmc_manager) | /projects | /admin/organizations | no API response | no | ar |
| Pilot 27 (pmc_manager) | /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 27 (pmc_manager) | /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 27 (pmc_manager) | /projects | /settings | no API response | no | ar |
| Pilot 28 (consultant_coordinator) | Projects | (sidebar) | captured | n/a | en |
| Pilot 28 (consultant_coordinator) | /projects | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | en |
| Pilot 28 (consultant_coordinator) | /projects | /admin/organizations | no API response | no | en |
| Pilot 28 (consultant_coordinator) | /projects | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 28 (consultant_coordinator) | /projects | /hr | /hr/employees=403 | no | en |
| Pilot 28 (consultant_coordinator) | /projects | /settings | no API response | no | en |
| Pilot 28 (consultant_coordinator) | المشاريع | (sidebar) | captured | n/a | ar |
| Pilot 28 (consultant_coordinator) | /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 28 (consultant_coordinator) | /projects | /admin/organizations | no API response | no | ar |
| Pilot 28 (consultant_coordinator) | /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 28 (consultant_coordinator) | /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 28 (consultant_coordinator) | /projects | /settings | no API response | no | ar |
| Pilot 29 (consultant_reviewer) | Projects | (sidebar) | captured | n/a | en |
| Pilot 29 (consultant_reviewer) | /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | en |
| Pilot 29 (consultant_reviewer) | /projects | /admin/organizations | no API response | no | en |
| Pilot 29 (consultant_reviewer) | /projects | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 29 (consultant_reviewer) | /projects | /hr | /hr/employees=403 | no | en |
| Pilot 29 (consultant_reviewer) | /projects | /settings | no API response | no | en |
| Pilot 29 (consultant_reviewer) | المشاريع | (sidebar) | captured | n/a | ar |
| Pilot 29 (consultant_reviewer) | /projects | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | ar |
| Pilot 29 (consultant_reviewer) | /projects | /admin/organizations | no API response | no | ar |
| Pilot 29 (consultant_reviewer) | /projects | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 29 (consultant_reviewer) | /projects | /hr | /hr/employees=403 | no | ar |
| Pilot 29 (consultant_reviewer) | /projects | /settings | no API response | no | ar |
| Pilot 30 (subcontractor_manager) | (none) | (sidebar) | captured | n/a | en |
| Pilot 30 (subcontractor_manager) |  | /admin/organizations | no API response | no | en |
| Pilot 30 (subcontractor_manager) |  | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 30 (subcontractor_manager) |  | /hr | /hr/employees=403 | no | en |
| Pilot 30 (subcontractor_manager) |  | /settings | no API response | no | en |
| Pilot 30 (subcontractor_manager) | (none) | (sidebar) | captured | n/a | ar |
| Pilot 30 (subcontractor_manager) |  | /admin/organizations | no API response | no | ar |
| Pilot 30 (subcontractor_manager) |  | /invoices | /finance/summary=403; /invoices=403 | no | ar |
| Pilot 30 (subcontractor_manager) |  | /hr | /hr/employees=403 | no | ar |
| Pilot 30 (subcontractor_manager) |  | /settings | no API response | no | ar |
| Pilot 31 (subcontractor_site_engineer) | (none) | (sidebar) | captured | n/a | en |
| Pilot 31 (subcontractor_site_engineer) |  | /admin/organizations | no API response | no | en |
| Pilot 31 (subcontractor_site_engineer) |  | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 31 (subcontractor_site_engineer) |  | /hr | /hr/employees=403 | no | en |
| Pilot 31 (subcontractor_site_engineer) |  | /settings | no API response | no | en |
| Pilot 31 (subcontractor_site_engineer) | (none) | (sidebar) | captured | n/a | ar |
| Pilot 31 (subcontractor_site_engineer) |  | /admin/organizations | no API response | no | ar |
| Pilot 31 (subcontractor_site_engineer) |  | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 31 (subcontractor_site_engineer) |  | /hr | /hr/employees=403 | no | ar |
| Pilot 31 (subcontractor_site_engineer) |  | /settings | no API response | no | ar |
| Pilot 32 (supplier_sales) | (none) | (sidebar) | captured | n/a | en |
| Pilot 32 (supplier_sales) |  | /admin/organizations | no API response | no | en |
| Pilot 32 (supplier_sales) |  | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 32 (supplier_sales) |  | /hr | /hr/employees=403 | no | en |
| Pilot 32 (supplier_sales) |  | /settings | no API response | no | en |
| Pilot 32 (supplier_sales) | (none) | (sidebar) | captured | n/a | ar |
| Pilot 32 (supplier_sales) |  | /admin/organizations | no API response | no | ar |
| Pilot 32 (supplier_sales) |  | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 32 (supplier_sales) |  | /hr | /hr/employees=403 | no | ar |
| Pilot 32 (supplier_sales) |  | /settings | no API response | no | ar |
| Pilot 33 (testing_lab) | (none) | (sidebar) | captured | n/a | en |
| Pilot 33 (testing_lab) |  | /admin/organizations | no API response | no | en |
| Pilot 33 (testing_lab) |  | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 33 (testing_lab) |  | /hr | /hr/employees=403 | no | en |
| Pilot 33 (testing_lab) |  | /settings | no API response | no | en |
| Pilot 33 (testing_lab) | (none) | (sidebar) | captured | n/a | ar |
| Pilot 33 (testing_lab) |  | /admin/organizations | no API response | no | ar |
| Pilot 33 (testing_lab) |  | /invoices | /finance/summary=403; /invoices=403 | no | ar |
| Pilot 33 (testing_lab) |  | /hr | /hr/employees=403 | no | ar |
| Pilot 33 (testing_lab) |  | /settings | no API response | no | ar |
| Pilot 34 (procurement_officer) | (none) | (sidebar) | captured | n/a | en |
| Pilot 34 (procurement_officer) |  | /admin/organizations | no API response | no | en |
| Pilot 34 (procurement_officer) |  | /invoices | /finance/summary=403; /invoices=403 | no | en |
| Pilot 34 (procurement_officer) |  | /hr | /hr/employees=403 | no | en |
| Pilot 34 (procurement_officer) |  | /settings | no API response | no | en |
| Pilot 34 (procurement_officer) |  | /projects/2/boq | /boq/items/2=403; /boq/sections/2=403; /projects/2=403 | no | en |
| Pilot 34 (procurement_officer) | (none) | (sidebar) | captured | n/a | ar |
| Pilot 34 (procurement_officer) |  | /admin/organizations | no API response | no | ar |
| Pilot 34 (procurement_officer) |  | /invoices | /finance/summary=403; /invoices=403 | no | ar |
| Pilot 34 (procurement_officer) |  | /hr | /hr/employees=403 | no | ar |
| Pilot 34 (procurement_officer) |  | /settings | no API response | no | ar |
| Pilot 34 (procurement_officer) |  | /projects/2/boq | /boq/items/2=403; /boq/sections/2=403; /projects/2=403 | no | ar |
| Pilot 35 (site_engineer) | (none) | (sidebar) | captured | n/a | en |
| Pilot 35 (site_engineer) |  | /admin/organizations | no API response | no | en |
| Pilot 35 (site_engineer) |  | /invoices | /invoices=403; /finance/summary=403 | no | en |
| Pilot 35 (site_engineer) |  | /hr | /hr/employees=403 | no | en |
| Pilot 35 (site_engineer) |  | /settings | no API response | no | en |
| Pilot 35 (site_engineer) |  | /projects/2/boq | /boq/sections/2=403; /boq/items/2=403; /projects/2=403 | no | en |
| Pilot 35 (site_engineer) | (none) | (sidebar) | captured | n/a | ar |
| Pilot 35 (site_engineer) |  | /admin/organizations | no API response | no | ar |
| Pilot 35 (site_engineer) |  | /invoices | /invoices=403; /finance/summary=403 | no | ar |
| Pilot 35 (site_engineer) |  | /hr | /hr/employees=403 | no | ar |
| Pilot 35 (site_engineer) |  | /settings | no API response | no | ar |
| Pilot 35 (site_engineer) |  | /projects/2/boq | /boq/sections/2=403; /boq/items/2=403; /projects/2=403 | no | ar |
| Pilot 36 (owner) | Dashboard, Projects, Inventory, Procurement comparison, Clients, Suppliers, Equipment, HR, Expenses, Invoices & Payments, Legal, Approvals, My Actions, Settings, Administration, Agent Activity | (sidebar) | captured | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=200; /dashboard/overview=200; /dashboard/role=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /clients | /clients=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /assets | /assets=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /hr | /hr/employees=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /expenses | /expenses=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /legal | /legal=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /approvals | /approvals/pending=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /settings | /finance-ledger/account-mappings=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /admin/organizations | /organizations=200 | n/a | en |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /agent-activity | /agent/activity=200; /agent/requests=200 | n/a | en |
| Pilot 36 (owner) | لوحة التحكم, المشاريع, المخزون, مقارنة المشتريات, العملاء, الموردين, المعدات, الموارد البشرية, المصروفات, الفواتير والمدفوعات, القسم القانوني, الموافقات, مهامي, الإعدادات, الإدارة, نشاط الوكلاء | (sidebar) | captured | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=200; /dashboard/overview=200; /dashboard/role=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /clients | /clients=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /assets | /assets=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /hr | /hr/employees=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /expenses | /expenses=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /legal | /legal=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /approvals | /approvals/pending=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /settings | /finance-ledger/account-mappings=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /admin/organizations | /organizations=200 | n/a | ar |
| Pilot 36 (owner) | /admin/organizations, /agent-activity, /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /settings, /suppliers | /agent-activity | /agent/activity=200; /agent/requests=200 | n/a | ar |
| Pilot 37 (purchasing_mgr) | Dashboard, Projects, Inventory, Procurement comparison, Suppliers, Invoices & Payments, My Actions | (sidebar) | captured | n/a | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /finance/summary=403; /dashboard/alerts=200; /dashboard/overview=200; /dashboard=200; /dashboard/role=200 | n/a | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=403 | n/a | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /finance/summary=403; /invoices=200 | n/a | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=403 | no | en |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | en |
| Pilot 37 (purchasing_mgr) | لوحة التحكم, المشاريع, المخزون, مقارنة المشتريات, الموردين, الفواتير والمدفوعات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard=200; /finance/summary=403; /dashboard/alerts=200; /dashboard/role=200; /dashboard/overview=200 | n/a | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=403 | n/a | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /finance/summary=403; /invoices=200 | n/a | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=403 | no | ar |
| Pilot 37 (purchasing_mgr) | /dashboard, /inventory, /invoices, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | ar |
| Pilot 38 (accountant) | Dashboard, Projects, Inventory, Procurement comparison, Clients, Suppliers, Equipment, HR, Expenses, Invoices & Payments, Legal, Approvals, My Actions | (sidebar) | captured | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /dashboard/overview=200; /finance/summary=200; /dashboard/role=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects/portfolio=200; /projects=200; /finance/project/2=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/my-requests=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | en |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | en |
| Pilot 38 (accountant) | لوحة التحكم, المشاريع, المخزون, مقارنة المشتريات, العملاء, الموردين, المعدات, الموارد البشرية, المصروفات, الفواتير والمدفوعات, القسم القانوني, الموافقات, مهامي | (sidebar) | captured | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /dashboard | /dashboard=200; /dashboard/alerts=200; /finance/summary=200; /dashboard/role=200; /dashboard/overview=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /projects | /projects=200; /projects/portfolio=200; /finance/project/2=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /inventory | /items=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /procurement/comparison | no API response | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /clients | /clients=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /suppliers | /suppliers=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /assets | /assets=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /hr | /hr/employees=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /expenses | /expenses=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /invoices | /invoices=200; /finance/summary=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /legal | /legal=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /approvals | /approvals/my-requests=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /my-actions | /notifications=200; /actions/my=200 | n/a | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /admin/organizations | no API response | no | ar |
| Pilot 38 (accountant) | /approvals, /assets, /clients, /dashboard, /expenses, /hr, /inventory, /invoices, /legal, /my-actions, /procurement/comparison, /projects, /suppliers | /settings | no API response | no | ar |

## Surprises

- HIGH: Pilot 17 (accountant_ap), en, /invoices; API 200 with data; visible data: false
- HIGH: Pilot 17 (accountant_ap), ar, /invoices; API 200 with data; visible data: false

## Decisions waiting

- Project discovery returned 1 real project ID. **NOT VERIFIED** - No project ID outside the account's recorded project scope was available for 72 account/language checks; no synthetic ID was substituted.
- **HIGH** - Review possible cross-role data exposure at /invoices for Pilot 17 (accountant_ap) (en). No access changes were made.
- **HIGH** - Review possible cross-role data exposure at /invoices for Pilot 17 (accountant_ap) (ar). No access changes were made.
- None.
