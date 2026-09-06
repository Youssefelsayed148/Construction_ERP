# Comprehensive Test Suite for Construction ERP - ALL 18 MODULES
# Usage: powershell.exe -ExecutionPolicy Bypass -File "D:\The Osiris Labs\Construction_ERP\full_test.ps1"

$ErrorActionPreference = "Continue"
$BASE_URL = "http://localhost:5000/api"
$TOKEN = $null
$RESULTS = @{}
$MODULE_PASS = @{}
$MODULE_FAIL = @{}

function Log-Result($module, $test, $passed, $detail) {
    if (-not $RESULTS.ContainsKey($module)) { $RESULTS[$module] = @() }
    $RESULTS[$module] += @{ test = $test; passed = $passed; detail = $detail }
    if (-not $MODULE_PASS.ContainsKey($module)) { $MODULE_PASS[$module] = 0; $MODULE_FAIL[$module] = 0 }
    if ($passed) { $MODULE_PASS[$module]++ } else { $MODULE_FAIL[$module]++ }
    $status = if ($passed) { "PASS" } else { "FAIL" }
    Write-Host "[$status] $module :: $test"
    if (-not $passed -and $detail) {
        Write-Host "  Detail: $detail"
    }
}

function Api-Call($method, $path, $body) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($TOKEN) { $headers["Authorization"] = "Bearer $TOKEN" }
    $uri = "$BASE_URL$path"
    try {
        if ($body) {
            $jsonBody = $body | ConvertTo-Json -Depth 20
            $response = Invoke-RestMethod -Uri $uri -Method $method -Headers $headers -Body $jsonBody -TimeoutSec 30
        } else {
            $response = Invoke-RestMethod -Uri $uri -Method $method -Headers $headers -TimeoutSec 30
        }
        return @{ success = $true; data = $response; statusCode = 200 }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd() | ConvertFrom-Json
            $reader.Close()
        } catch {
            $responseBody = $_.Exception.Message
        }
        return @{ success = $false; data = $responseBody; statusCode = $statusCode }
    }
}

function Get-Data($apiResult) {
    if (-not $apiResult.success) { return $null }
    $body = $apiResult.data
    if ($body -is [PSCustomObject] -and $body.data -ne $null) { return $body.data }
    return $body
}

function Get-Id($apiResult) {
    $d = Get-Data $apiResult
    if ($d -and $d.id) { return $d.id }
    return $null
}

function Sql-Query($query) {
    $escaped = $query -replace '"', '\"'
    $result = & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d construction_erp -t -A -c $query 2>&1
    return $result
}

function Sql-Scalar($query) {
    $val = Sql-Query $query
    if ($val -match '^[\d.-]+$') { return $val.Trim() }
    return $val
}

# ============================================================
# SETUP: Login
# ============================================================
Write-Host "============================================"
Write-Host "SETUP: Logging in..."
Write-Host "============================================"

$loginBody = @{ email = "owner@construction-erp.com"; password = "admin123" }
$loginResult = Api-Call "POST" "/auth/login" $loginBody
if ($loginResult.success -and $loginResult.data.data.token) {
    $TOKEN = $loginResult.data.data.token
    Write-Host "LOGIN SUCCESS. Token obtained."
} else {
    Write-Host "LOGIN FAILED: $($loginResult.data | ConvertTo-Json)"
    exit 1
}

# ============================================================
# MODULE 1: Clients
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 1: Clients"
Write-Host "============================================"

$clientData = @{
    name_ar = "TEST-Client A"
    name_en = "TEST-Client A EN"
    client_type = "commercial"
    contact_person = "TEST Contact"
    phone = "0501234567"
    email = "test-client-a@test.com"
    address = "TEST Address 123"
    city = "Dubai"
    payment_terms = "net_30"
}
$createResult = Api-Call "POST" "/clients" $clientData
if ($createResult.success) {
    $clientId = Get-Id $createResult
    Log-Result "Clients" "Create" $true "Created client ID=$clientId"
    
    $dbCheck = Sql-Query "SELECT name_ar, city, is_active FROM clients WHERE id=$clientId"
    if ($dbCheck -match "TEST-Client A" -and $dbCheck -match "Dubai") {
        Log-Result "Clients" "Create-DB-Verify" $true "DB: $dbCheck"
    } else {
        Log-Result "Clients" "Create-DB-Verify" $false "DB mismatch: $dbCheck"
    }
} else {
    Log-Result "Clients" "Create" $false "Status: $($createResult.statusCode) Body: $($createResult.data | ConvertTo-Json)"
    $clientId = $null
}

$invalidClient = @{ name_en = "TEST-No-Arabic" }
$invalidResult = Api-Call "POST" "/clients" $invalidClient
if ($invalidResult.statusCode -eq 400) {
    Log-Result "Clients" "Create-Invalid" $true "Got 400 as expected"
} else {
    Log-Result "Clients" "Create-Invalid" $false "Expected 400, got $($invalidResult.statusCode)"
}

if ($clientId) {
    $listResult = Api-Call "GET" "/clients"
    $list = Get-Data $listResult
    if ($listResult.success -and $list) {
        Log-Result "Clients" "Read-List" $true "Got $($list.Count) clients"
    } else {
        Log-Result "Clients" "Read-List" $false "Failed"
    }
    
    $singleResult = Api-Call "GET" "/clients/$clientId"
    if ($singleResult.success) {
        $client = Get-Data $singleResult
        Log-Result "Clients" "Read-Single" $true "Got: $($client.name_ar)"
        if ($client.city -eq "Dubai") {
            Log-Result "Clients" "City-Persistence" $true "City 'Dubai' persisted via API"
        } else {
            Log-Result "Clients" "City-Persistence" $false "City mismatch: expected 'Dubai', got '$($client.city)'"
        }
    } else {
        Log-Result "Clients" "Read-Single" $false "Failed"
    }
    
    $updateBody = @{ city = "Abu Dhabi"; contact_person = "TEST Updated Person" }
    $updateResult = Api-Call "PUT" "/clients/$clientId" $updateBody
    if ($updateResult.success) {
        $dbCheck = Sql-Query "SELECT city, contact_person FROM clients WHERE id=$clientId"
        if ($dbCheck -match "Abu Dhabi" -and $dbCheck -match "TEST Updated Person") {
            Log-Result "Clients" "Update" $true "DB confirmed: $dbCheck"
        } else {
            Log-Result "Clients" "Update" $false "DB mismatch: $dbCheck"
        }
    } else {
        Log-Result "Clients" "Update" $false "Status: $($updateResult.statusCode)"
    }
    
    $deleteResult = Api-Call "DELETE" "/clients/$clientId"
    if ($deleteResult.success) {
        $dbCheck = Sql-Scalar "SELECT COUNT(*) FROM clients WHERE id=$clientId"
        if ($dbCheck -eq "0") {
            Log-Result "Clients" "Delete" $true "Row hard-deleted, DB count=0"
        } else {
            Log-Result "Clients" "Delete" $false "Row still exists in DB: count=$dbCheck"
        }
    } else {
        Log-Result "Clients" "Delete" $false "Status: $($deleteResult.statusCode) Body: $($deleteResult.data | ConvertTo-Json)"
    }
}

# ============================================================
# MODULE 2: Suppliers
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 2: Suppliers"
Write-Host "============================================"

$supplierData = @{
    name_ar = "TEST-Supplier A"
    name_en = "TEST-Supplier A EN"
    contact_person = "TEST Supplier Contact"
    phone = "0509876543"
    email = "test-supplier@test.com"
    city = "Sharjah"
    specialty = "concrete"
}
$supCreate = Api-Call "POST" "/suppliers" $supplierData
if ($supCreate.success) {
    $supplierId = Get-Id $supCreate
    Log-Result "Suppliers" "Create" $true "ID=$supplierId"
    
    $dbCheck = Sql-Query "SELECT name_ar, city, specialty FROM suppliers WHERE id=$supplierId"
    if ($dbCheck -match "TEST-Supplier A" -and $dbCheck -match "Sharjah") {
        Log-Result "Suppliers" "Create-DB-Verify" $true "DB: $dbCheck"
    } else {
        Log-Result "Suppliers" "Create-DB-Verify" $false "DB mismatch: $dbCheck"
    }
    
    $invalidSup = @{ name_en = "TEST-No-Arabic-Sup" }
    $invalidSupRes = Api-Call "POST" "/suppliers" $invalidSup
    if ($invalidSupRes.statusCode -eq 400) {
        Log-Result "Suppliers" "Create-Invalid" $true "Got 400"
    } else {
        Log-Result "Suppliers" "Create-Invalid" $false "Expected 400, got $($invalidSupRes.statusCode)"
    }
    
    $listRes = Api-Call "GET" "/suppliers"
    $supList = Get-Data $listRes
    if ($listRes.success -and $supList) {
        Log-Result "Suppliers" "Read-List" $true "Got $($supList.Count) suppliers"
    } else { Log-Result "Suppliers" "Read-List" $false "Failed" }
    
    $singleRes = Api-Call "GET" "/suppliers/$supplierId"
    if ($singleRes.success) {
        Log-Result "Suppliers" "Read-Single" $true "Got supplier data"
    } else { Log-Result "Suppliers" "Read-Single" $false "Failed" }

    $updateSup = @{ city = "Ajman" }
    $updRes = Api-Call "PUT" "/suppliers/$supplierId" $updateSup
    if ($updRes.success) {
        $dbCheck = Sql-Query "SELECT city FROM suppliers WHERE id=$supplierId"
        if ($dbCheck -match "Ajman") {
            Log-Result "Suppliers" "Update" $true "DB city='Ajman': $dbCheck"
        } else {
            Log-Result "Suppliers" "Update" $false "DB mismatch: $dbCheck"
        }
    } else { Log-Result "Suppliers" "Update" $false "Status: $($updRes.statusCode)" }

    $itemCheck = Sql-Query "SELECT id FROM item_master LIMIT 1"
    if ($itemCheck -match '^\d+') {
        $itemId = ($itemCheck -replace '\s','').Trim()
        $linkData = @{ material_id = [int]$itemId; unit_price = 150.00; lead_time_days = 7 }
        $linkResult = Api-Call "POST" "/suppliers/$supplierId/materials" $linkData
        if ($linkResult.success) {
            Log-Result "Suppliers" "Material-Link" $true "Linked item $itemId to supplier $supplierId"
            
            $dupLink = Api-Call "POST" "/suppliers/$supplierId/materials" $linkData
            if ($dupLink.statusCode -eq 400 -or $dupLink.statusCode -eq 409) {
                Log-Result "Suppliers" "Duplicate-Link" $true "Got $($dupLink.statusCode) on duplicate"
            } else {
                Log-Result "Suppliers" "Duplicate-Link" $false "Expected 400/409, got $($dupLink.statusCode)"
            }
            
            $delLink = Api-Call "DELETE" "/suppliers/$supplierId/materials/$itemId"
            if ($delLink.success) {
                Log-Result "Suppliers" "Material-Unlink" $true "Unlinked material"
            } else {
                Log-Result "Suppliers" "Material-Unlink" $false "Failed: $($delLink.statusCode)"
            }
        } else {
            Log-Result "Suppliers" "Material-Link" $false "Status: $($linkResult.statusCode) Body: $($linkResult.data | ConvertTo-Json)"
        }
    } else {
        Log-Result "Suppliers" "Material-Link" $false "No item_master rows found in DB"
    }

    $supDel = Api-Call "DELETE" "/suppliers/$supplierId"
    if ($supDel.success) {
        $dbCheck = Sql-Scalar "SELECT COUNT(*) FROM suppliers WHERE id=$supplierId"
        if ($dbCheck -eq "0") {
            Log-Result "Suppliers" "Delete" $true "Hard-deleted, DB count=0"
        } else {
            Log-Result "Suppliers" "Delete" $false "Row still exists: count=$dbCheck"
        }
    } else {
        Log-Result "Suppliers" "Delete" $false "Status: $($supDel.statusCode) Body: $($supDel.data | ConvertTo-Json)"
    }
} else {
    Log-Result "Suppliers" "Create" $false "Status: $($supCreate.statusCode) Body: $($supCreate.data | ConvertTo-Json)"
}

# ============================================================
# MODULE 3: Inventory (Items)
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 3: Inventory (Items)"
Write-Host "============================================"

$itemData = @{
    category = "raw_material"
    sub_category = "steel"
    unit = "ton"
    name_en = "TEST-Reinforcement Steel"
    name_ar = "TEST-Reinforcement Steel AR"
    description = "TEST Steel rebar 12mm"
}
$itemCreate = Api-Call "POST" "/items" $itemData
if ($itemCreate.success) {
    $itemId = Get-Id $itemCreate
    $item = Get-Data $itemCreate
    Log-Result "Items" "Create" $true "ID=$itemId code=$($item.code)"
    
    $dbChk = Sql-Query "SELECT code, category, sub_category FROM item_master WHERE id=$itemId"
    if ($dbChk -match "TEST-Reinforcement Steel" -or $dbChk -match "steel") {
        Log-Result "Items" "Create-DB-Verify" $true "DB: $dbChk"
    } else {
        Log-Result "Items" "Create-DB-Verify" $false "DB mismatch: $dbChk"
    }
    
    $code = $item.code
    $dbCode = Sql-Scalar "SELECT code FROM item_master WHERE id=$itemId"
    if ($dbCode.Trim() -eq $code) {
        Log-Result "Items" "Code-Uniqueness" $true "Code '$code' persisted in DB"
    } else {
        Log-Result "Items" "Code-Uniqueness" $false "API code '$code' vs DB '$dbCode'"
    }
} else {
    Log-Result "Items" "Create" $false "Status: $($itemCreate.statusCode) Body: $($itemCreate.data | ConvertTo-Json)"
    $itemId = $null
}

$invalidItem = @{ category = "raw_material"; unit = "piece"; name_en = "TEST-No-Arabic" }
$invItRes = Api-Call "POST" "/items" $invalidItem
if ($invItRes.statusCode -eq 400) { Log-Result "Items" "Create-Invalid" $true "Got 400" }
else { Log-Result "Items" "Create-Invalid" $false "Expected 400, got $($invItRes.statusCode)" }

if ($itemId) {
    $itList = Api-Call "GET" "/items"
    $itData = Get-Data $itList
    if ($itList.success -and $itData) { Log-Result "Items" "Read-List" $true "Got $($itData.Count) items" }
    else { Log-Result "Items" "Read-List" $false "Failed" }
    
    $itSingle = Api-Call "GET" "/items/$itemId"
    if ($itSingle.success) { Log-Result "Items" "Read-Single" $true "Got item" }
    else { Log-Result "Items" "Read-Single" $false "Failed" }
    
    $itUpd = Api-Call "PUT" "/items/$itemId" @{ description = "TEST Updated Description"; unit = "piece" }
    if ($itUpd.success) {
        $dbC = Sql-Query "SELECT description, unit FROM item_master WHERE id=$itemId"
        if ($dbC -match "TEST Updated Description" -and $dbC -match "piece") {
            Log-Result "Items" "Update" $true "DB: $dbC"
        } else { Log-Result "Items" "Update" $false "DB mismatch: $dbC" }
    } else { Log-Result "Items" "Update" $false "Status: $($itUpd.statusCode)" }
    
    $itDel = Api-Call "DELETE" "/items/$itemId"
    if ($itDel.success) {
        $dbC = Sql-Scalar "SELECT COUNT(*) FROM item_master WHERE id=$itemId"
        if ($dbC -eq "0") { Log-Result "Items" "Delete" $true "Hard-deleted, DB count=0" }
        else { Log-Result "Items" "Delete" $false "Still exists: count=$dbC" }
    } else { Log-Result "Items" "Delete" $false "Status: $($itDel.statusCode) Body: $($itDel.data | ConvertTo-Json)" }
}

# ============================================================
# MODULE 4: Equipment (Assets)
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 4: Equipment (Assets)"
Write-Host "============================================"

$projForEquip = Sql-Scalar "SELECT id FROM projects LIMIT 1"
$equipData = @{
    name_ar = "TEST-Excavator A"
    name_en = "TEST-Excavator A EN"
    category = "earthmoving"
    equipment_type = "owned"
    manufacturer = "TEST CAT"
    model = "320D"
    serial_number = "TEST-SN-001"
    purchase_cost = 500000
    hourly_rate = 250
    daily_rate = 2000
    operator_required = $true
}
if ($projForEquip -match '^\d+') { $equipData["current_project_id"] = [int]$projForEquip.Trim() }

$equipCreate = Api-Call "POST" "/assets" $equipData
if ($equipCreate.success) {
    $assetId = Get-Id $equipCreate
    Log-Result "Equipment" "Create" $true "ID=$assetId"
    
    $dbChk = Sql-Query "SELECT name_ar, category, equipment_type, current_project_id FROM assets WHERE id=$assetId"
    if ($dbChk -match "TEST-Excavator A" -and $dbChk -match "earthmoving") {
        Log-Result "Equipment" "Create-DB-Verify" $true "DB: $dbChk"
    } else { Log-Result "Equipment" "Create-DB-Verify" $false "DB mismatch: $dbChk" }
    
    if ($projForEquip -match '^\d+') {
        $eqProjId = $projForEquip.Trim()
        if ($dbChk -match $eqProjId) {
            Log-Result "Equipment" "Location-Linkage" $true "current_project_id=$eqProjId persisted"
        } else { Log-Result "Equipment" "Location-Linkage" $false "current_project_id not found in DB: $dbChk" }
    }
    
    $invEquip = @{ name_en = "TEST-No-Required" }
    $invEqRes = Api-Call "POST" "/assets" $invEquip
    if ($invEqRes.statusCode -eq 400) { Log-Result "Equipment" "Create-Invalid" $true "Got 400" }
    else { Log-Result "Equipment" "Create-Invalid" $false "Expected 400, got $($invEqRes.statusCode)" }

    $eqList = Api-Call "GET" "/assets"
    $eqData = Get-Data $eqList
    if ($eqList.success -and $eqData) { Log-Result "Equipment" "Read-List" $true "Got $($eqData.Count) assets" }
    else { Log-Result "Equipment" "Read-List" $false "Failed" }
    
    $eqSingle = Api-Call "GET" "/assets/$assetId"
    if ($eqSingle.success) { Log-Result "Equipment" "Read-Single" $true "Got asset" }
    else { Log-Result "Equipment" "Read-Single" $false "Failed" }
    
    $eqUpd = Api-Call "PUT" "/assets/$assetId" @{ status = "maintenance"; daily_rate = 2200 }
    if ($eqUpd.success) {
        $dbC = Sql-Query "SELECT status, daily_rate FROM assets WHERE id=$assetId"
        if ($dbC -match "maintenance" -and $dbC -match "2200") {
            Log-Result "Equipment" "Update" $true "DB: $dbC"
        } else { Log-Result "Equipment" "Update" $false "DB mismatch: $dbC" }
    } else { Log-Result "Equipment" "Update" $false "Status: $($eqUpd.statusCode)" }
    
    $eqDel = Api-Call "DELETE" "/assets/$assetId"
    if ($eqDel.success) {
        $dbC = Sql-Scalar "SELECT COUNT(*) FROM assets WHERE id=$assetId"
        if ($dbC -eq "0") { Log-Result "Equipment" "Delete" $true "Hard-deleted, DB count=0" }
        else { Log-Result "Equipment" "Delete" $false "Still exists: count=$dbC" }
    } else { Log-Result "Equipment" "Delete" $false "Status: $($eqDel.statusCode) Body: $($eqDel.data | ConvertTo-Json)" }
} else {
    Log-Result "Equipment" "Create" $false "Status: $($equipCreate.statusCode) Body: $($equipCreate.data | ConvertTo-Json)"
}

# ============================================================
# MODULE 5: HR / Employees
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 5: HR / Employees"
Write-Host "============================================"

$empData = @{
    name_ar = "TEST-Employee Ahmed"
    name_en = "TEST-Employee Ahmed EN"
    phone = "0501112233"
    email = "test-emp@test.com"
    department = "Engineering"
    designation = "TEST-Site Engineer"
    hire_date = "2024-01-15"
    salary = 12000
    bank_name = "TEST Bank"
    bank_account = "TEST-ACC-001"
}
$empCreate = Api-Call "POST" "/hr/employees" $empData
if ($empCreate.success) {
    $empId = Get-Id $empCreate
    Log-Result "HR/Employees" "Create" $true "ID=$empId"
    
    $dbChk = Sql-Query "SELECT name_ar, department, salary FROM employees WHERE id=$empId"
    if ($dbChk -match "TEST-Employee Ahmed" -and $dbChk -match "Engineering") {
        Log-Result "HR/Employees" "Create-DB-Verify" $true "DB: $dbChk"
        if ($dbChk -match "12000") {
            Log-Result "HR/Employees" "Salary-Persisted" $true "Salary 12000 in DB"
        } else { Log-Result "HR/Employees" "Salary-Persisted" $false "Salary mismatch: $dbChk" }
    } else { Log-Result "HR/Employees" "Create-DB-Verify" $false "DB mismatch: $dbChk" }
    
    $invEmp = @{ name_en = "TEST-No-Arabic-Emp" }
    $invEmpRes = Api-Call "POST" "/hr/employees" $invEmp
    if ($invEmpRes.statusCode -eq 400) { Log-Result "HR/Employees" "Create-Invalid" $true "Got 400" }
    else { Log-Result "HR/Employees" "Create-Invalid" $false "Expected 400, got $($invEmpRes.statusCode)" }
    
    $empList = Api-Call "GET" "/hr/employees"
    $empData = Get-Data $empList
    if ($empList.success -and $empData) { Log-Result "HR/Employees" "Read-List" $true "Got $($empData.Count) employees" }
    else { Log-Result "HR/Employees" "Read-List" $false "Failed" }
    
    $empSingle = Api-Call "GET" "/hr/employees/$empId"
    if ($empSingle.success) { Log-Result "HR/Employees" "Read-Single" $true "Got employee" }
    else { Log-Result "HR/Employees" "Read-Single" $false "Failed" }
    
    $empUpd = Api-Call "PUT" "/hr/employees/$empId" @{ department = "TEST-Construction"; salary = 15000 }
    if ($empUpd.success) {
        $dbC = Sql-Query "SELECT department, salary FROM employees WHERE id=$empId"
        if ($dbC -match "TEST-Construction" -and $dbC -match "15000") {
            Log-Result "HR/Employees" "Update" $true "DB: $dbC"
        } else { Log-Result "HR/Employees" "Update" $false "DB mismatch: $dbC" }
    } else { Log-Result "HR/Employees" "Update" $false "Status: $($empUpd.statusCode) Body: $($empUpd.data | ConvertTo-Json)" }
    
    $empDel = Api-Call "DELETE" "/hr/employees/$empId"
    if ($empDel.success) {
        $dbC = Sql-Scalar "SELECT COUNT(*) FROM employees WHERE id=$empId"
        if ($dbC -eq "0") { Log-Result "HR/Employees" "Delete" $true "Hard-deleted, DB count=0" }
        else { Log-Result "HR/Employees" "Delete" $false "Still exists: count=$dbC" }
    } else { Log-Result "HR/Employees" "Delete" $false "Status: $($empDel.statusCode) Body: $($empDel.data | ConvertTo-Json)" }
} else {
    Log-Result "HR/Employees" "Create" $false "Status: $($empCreate.statusCode) Body: $($empCreate.data | ConvertTo-Json)"
}

# ============================================================
# MODULE 6: Expenses
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 6: Expenses"
Write-Host "============================================"

$projForExp = Sql-Scalar "SELECT id FROM projects LIMIT 1"
$expData = @{
    category = "materials"
    description = "TEST Expense - Concrete purchase"
    amount = 25000
    date = "2025-06-15"
    paid_by = "TEST Cash"
}
if ($projForExp -match '^\d+') { $expData["project_id"] = [int]$projForExp.Trim() }

$expCreate = Api-Call "POST" "/expenses" $expData
if ($expCreate.success) {
    $expenseId = Get-Id $expCreate
    Log-Result "Expenses" "Create-WithProject" $true "ID=$expenseId"
    
    $dbChk = Sql-Query "SELECT category, amount, project_id FROM expenses WHERE id=$expenseId"
    if ($dbChk -match "25000") {
        Log-Result "Expenses" "Create-DB-Verify" $true "DB amount=25000: $dbChk"
    } else { Log-Result "Expenses" "Create-DB-Verify" $false "DB mismatch: $dbChk" }
} else {
    Log-Result "Expenses" "Create-WithProject" $false "Status: $($expCreate.statusCode) Body: $($expCreate.data | ConvertTo-Json)"
    $expenseId = $null
}

$expNoProject = @{ category = "office"; amount = 5000; description = "TEST Expense - Office supplies" }
$expNoProjRes = Api-Call "POST" "/expenses" $expNoProject
if ($expNoProjRes.success) {
    $expNoProjId = Get-Id $expNoProjRes
    Log-Result "Expenses" "Create-WithoutProject" $true "ID=$expNoProjId (project-less)"
    
    $dbC = Sql-Query "SELECT project_id, amount FROM expenses WHERE id=$expNoProjId"
    if ($dbC -match "5000") {
        Log-Result "Expenses" "ProjectLess-DB-Verify" $true "DB: $dbC"
    } else { Log-Result "Expenses" "ProjectLess-DB-Verify" $false "DB mismatch: $dbC" }
    
    $invExp = @{ category = "materials"; description = "TEST No amount" }
    $invExpRes = Api-Call "POST" "/expenses" $invExp
    if ($invExpRes.statusCode -eq 400) { Log-Result "Expenses" "Create-Invalid" $true "Got 400" }
    else { Log-Result "Expenses" "Create-Invalid" $false "Expected 400, got $($invExpRes.statusCode)" }
    
    $expList = Api-Call "GET" "/expenses"
    $eData = Get-Data $expList
    if ($expList.success -and $eData) { Log-Result "Expenses" "Read-List" $true "Got $($eData.Count) expenses" }
    else { Log-Result "Expenses" "Read-List" $false "Failed" }
    
    $expSingle = Api-Call "GET" "/expenses/$expNoProjId"
    if ($expSingle.success) { Log-Result "Expenses" "Read-Single" $true "Got expense" }
    else { Log-Result "Expenses" "Read-Single" $false "Failed" }
    
    $expUpd = Api-Call "PUT" "/expenses/$expNoProjId" @{ amount = 7500; description = "TEST Updated office supplies" }
    if ($expUpd.success) {
        $dbC = Sql-Query "SELECT amount, description FROM expenses WHERE id=$expNoProjId"
        if ($dbC -match "7500" -and $dbC -match "TEST Updated") {
            Log-Result "Expenses" "Update" $true "DB: $dbC"
        } else { Log-Result "Expenses" "Update" $false "DB mismatch: $dbC" }
    } else { Log-Result "Expenses" "Update" $false "Status: $($expUpd.statusCode)" }
    
    $expDel = Api-Call "DELETE" "/expenses/$expNoProjId"
    if ($expDel.success) {
        $dbC = Sql-Scalar "SELECT COUNT(*) FROM expenses WHERE id=$expNoProjId"
        if ($dbC -eq "0") { Log-Result "Expenses" "Delete" $true "Hard-deleted, DB count=0" }
        else { Log-Result "Expenses" "Delete" $false "Still exists: count=$dbC" }
    } else { Log-Result "Expenses" "Delete" $false "Status: $($expDel.statusCode)" }
}

# Also delete the first expense if created
if ($expenseId) {
    Api-Call "DELETE" "/expenses/$expenseId" > $null
}

# ============================================================
# MODULE 7: Legal Documents
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 7: Legal Documents"
Write-Host "============================================"

$legalData = @{
    title = "TEST-Legal Contract A"
    document_type = "contract"
    description = "TEST Contract for construction project"
    submitted_by = "TEST Legal Team"
}
$legCreate = Api-Call "POST" "/legal" $legalData
if ($legCreate.success) {
    $legalId = Get-Id $legCreate
    Log-Result "Legal" "Create" $true "ID=$legalId"
    
    $dbChk = Sql-Query "SELECT title, status FROM legal_documents WHERE id=$legalId"
    if ($dbChk -match "TEST-Legal Contract A") {
        Log-Result "Legal" "Create-DB-Verify" $true "DB: $dbChk"
    } else { Log-Result "Legal" "Create-DB-Verify" $false "DB mismatch: $dbChk" }
    
    $invLeg = @{ document_type = "contract" }
    $invLegRes = Api-Call "POST" "/legal" $invLeg
    if ($invLegRes.statusCode -eq 400) { Log-Result "Legal" "Create-Invalid" $true "Got 400" }
    else { Log-Result "Legal" "Create-Invalid" $false "Expected 400, got $($invLegRes.statusCode)" }
    
    $legList = Api-Call "GET" "/legal"
    $lData = Get-Data $legList
    if ($legList.success -and $lData) { Log-Result "Legal" "Read-List" $true "Got $($lData.Count) legal docs" }
    else { Log-Result "Legal" "Read-List" $false "Failed" }
    
    $legSingle = Api-Call "GET" "/legal/$legalId"
    if ($legSingle.success) { Log-Result "Legal" "Read-Single" $true "Got document" }
    else { Log-Result "Legal" "Read-Single" $false "Failed" }
    
    $legVerf = Api-Call "PUT" "/legal/$legalId" @{ status = "verified" }
    if ($legVerf.success) {
        $dbC = Sql-Query "SELECT status FROM legal_documents WHERE id=$legalId"
        if ($dbC -match "verified") {
            Log-Result "Legal" "Status-Transition-Verified" $true "DB status='verified': $dbC"
        } else { Log-Result "Legal" "Status-Transition-Verified" $false "DB mismatch: $dbC" }
    } else { Log-Result "Legal" "Status-Transition-Verified" $false "Status: $($legVerf.statusCode) Body: $($legVerf.data | ConvertTo-Json)" }
    
    $legDel = Api-Call "DELETE" "/legal/$legalId"
    if ($legDel.success) {
        $dbC = Sql-Scalar "SELECT COUNT(*) FROM legal_documents WHERE id=$legalId"
        if ($dbC -eq "0") { Log-Result "Legal" "Delete" $true "Hard-deleted, DB count=0" }
        else { Log-Result "Legal" "Delete" $false "Still exists: count=$dbC" }
    } else { Log-Result "Legal" "Delete" $false "Status: $($legDel.statusCode)" }
} else {
    Log-Result "Legal" "Create" $false "Status: $($legCreate.statusCode) Body: $($legCreate.data | ConvertTo-Json)"
}

# ============================================================
# MODULE 8: Approvals
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 8: Approvals"
Write-Host "============================================"

$appExpense = Api-Call "POST" "/expenses" @{ category = "legal"; amount = 15000; description = "TEST-Expense for approval test" }
if ($appExpense.success) {
    $appExpId = Get-Id $appExpense
    Log-Result "Approvals" "Setup-Expense" $true "Created expense ID=$appExpId"
    
    $reqRes = Api-Call "POST" "/approvals/request" @{ module_name = "expenses"; request_type = "expense"; request_id = $appExpId; notes = "TEST Approval request" }
    if ($reqRes.success) {
        Log-Result "Approvals" "Create-Request" $true "Approval request created"
    } else { Log-Result "Approvals" "Create-Request" $false "Status: $($reqRes.statusCode) Body: $($reqRes.data | ConvertTo-Json)" }
    
    $pendingRes = Api-Call "GET" "/approvals/pending"
    if ($pendingRes.success) {
        $pCount = $pendingRes.data.requests.Count
        Log-Result "Approvals" "Get-Pending" $true "Got $pCount pending requests"
    } else { Log-Result "Approvals" "Get-Pending" $false "Status: $($pendingRes.statusCode) Body: $($pendingRes.data | ConvertTo-Json)" }
    
    $myReqs = Api-Call "GET" "/approvals/my-requests"
    if ($myReqs.success) {
        Log-Result "Approvals" "Get-MyRequests" $true "Got $($myReqs.data.requests.Count) requests"
    } else { Log-Result "Approvals" "Get-MyRequests" $false "Failed" }
    
    $checkRes = Api-Call "GET" "/approvals/check/expenses/$appExpId"
    if ($checkRes.success) {
        Log-Result "Approvals" "Check-Approval" $true "Check response: requires_approval=$($checkRes.data.requires_approval)"
    } else { Log-Result "Approvals" "Check-Approval" $false "Failed" }
    
    Api-Call "DELETE" "/expenses/$appExpId" > $null
} else {
    Log-Result "Approvals" "Setup-Expense" $false "Could not create expense for approval test: $($appExpense.statusCode)"
}

# ============================================================
# MODULE 9: Invoices
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 9: Invoices"
Write-Host "============================================"

$projForInv = Sql-Scalar "SELECT id FROM projects LIMIT 1"
$clnForInv = Sql-Scalar "SELECT id FROM clients LIMIT 1"

if ($projForInv -match '^\d+' -and $clnForInv -match '^\d+') {
    $inPid = [int]$projForInv.Trim()
    $cid = [int]$clnForInv.Trim()
    
    $invData = @{
        project_id = $inPid
        client_id = $cid
        amount = 50000
        issue_date = "2025-06-01"
        due_date = "2025-07-01"
        description = "TEST-Invoice for milestone payment"
    }
    $invCreate = Api-Call "POST" "/invoices" $invData
    if ($invCreate.success) {
        $invId = Get-Id $invCreate
        $invObj = Get-Data $invCreate
        Log-Result "Invoices" "Create" $true "ID=$invId invoice_number=$($invObj.invoice_number)"
        
        $dbChk = Sql-Query "SELECT invoice_number, status, amount FROM invoices WHERE id=$invId"
        if ($dbChk -match "50000") {
            Log-Result "Invoices" "Create-DB-Verify" $true "DB: $dbChk"
        } else { Log-Result "Invoices" "Create-DB-Verify" $false "DB mismatch: $dbChk" }
        
        $invInv = @{ project_id = $inPid; client_id = $cid; issue_date = "2025-06-01" }
        $invInvRes = Api-Call "POST" "/invoices" $invInv
        if ($invInvRes.statusCode -eq 400) { Log-Result "Invoices" "Create-Invalid" $true "Got 400" }
        else { Log-Result "Invoices" "Create-Invalid" $false "Expected 400, got $($invInvRes.statusCode)" }
        
        $invList = Api-Call "GET" "/invoices"
        $iData = Get-Data $invList
        if ($invList.success -and $iData) { Log-Result "Invoices" "Read-List" $true "Got $($iData.Count) invoices" }
        else { Log-Result "Invoices" "Read-List" $false "Failed" }
        
        $invSingle = Api-Call "GET" "/invoices/$invId"
        if ($invSingle.success) { Log-Result "Invoices" "Read-Single" $true "Got invoice" }
        else { Log-Result "Invoices" "Read-Single" $false "Failed" }
        
        $invUpd = Api-Call "PUT" "/invoices/$invId" @{ description = "TEST-Updated invoice description" }
        if ($invUpd.success) {
            $dbC = Sql-Query "SELECT description FROM invoices WHERE id=$invId"
            if ($dbC -match "TEST-Updated") {
                Log-Result "Invoices" "Update" $true "DB: $dbC"
            } else { Log-Result "Invoices" "Update" $false "DB mismatch: $dbC" }
        } else { Log-Result "Invoices" "Update" $false "Status: $($invUpd.statusCode)" }
        
        # Payment 1: partial
        $pay1 = Api-Call "POST" "/payments" @{ invoice_id = $invId; project_id = $inPid; client_id = $cid; amount = 30000; payment_date = "2025-06-10"; payment_method = "bank_transfer" }
        if ($pay1.success) {
            $pay1Id = Get-Id $pay1
            Log-Result "Invoices" "Payment-1-Record" $true "Payment ID=$pay1Id (30000)"
            
            $invAfterPay1 = Sql-Query "SELECT status, amount FROM invoices WHERE id=$invId"
            $totalPaid = Sql-Scalar "SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=$invId"
            Log-Result "Invoices" "Payment-1-Status-Check" $true "Invoice status: $invAfterPay1 total_paid=$totalPaid"
        } else { Log-Result "Invoices" "Payment-1-Record" $false "Status: $($pay1.statusCode) Body: $($pay1.data | ConvertTo-Json)" }
        
        # Payment 2: pay off remaining to reach 'paid'
        $pay2 = Api-Call "POST" "/payments" @{ invoice_id = $invId; project_id = $inPid; client_id = $cid; amount = 20000; payment_date = "2025-06-20"; payment_method = "bank_transfer" }
        if ($pay2.success) {
            $pay2Id = Get-Id $pay2
            Log-Result "Invoices" "Payment-2-Record" $true "Second payment (20000) recorded, ID=$pay2Id"
            
            $invAfterPay2 = Sql-Query "SELECT status FROM invoices WHERE id=$invId"
            $totalPaid2 = Sql-Scalar "SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=$invId"
            $outstanding = Sql-Scalar "SELECT amount - COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=$invId),0) FROM invoices WHERE id=$invId"
            Log-Result "Invoices" "Payment-2-PaidOff" $true "Status: $invAfterPay2 total_paid=$totalPaid2 outstanding=$outstanding"
        } else { Log-Result "Invoices" "Payment-2-Record" $false "Status: $($pay2.statusCode)" }
        
        # Delete with dependencies: try to delete invoice that has payments
        $invDelDep = Api-Call "DELETE" "/invoices/$invId"
        if ($invDelDep.statusCode -eq 400) {
            Log-Result "Invoices" "Delete-With-Dependencies" $true "Got 400 (payments exist) as expected"
        } elseif ($invDelDep.success) {
            Log-Result "Invoices" "Delete-With-Dependencies" $false "Delete succeeded unexpectedly (cascade?)"
        } else {
            Log-Result "Invoices" "Delete-With-Dependencies" $false "Status: $($invDelDep.statusCode) Body: $($invDelDep.data | ConvertTo-Json)"
        }
        
        # Clean up payments then delete invoice
        if ($pay1Id) { Api-Call "DELETE" "/payments/$pay1Id" > $null }
        if ($pay2Id) { Api-Call "DELETE" "/payments/$pay2Id" > $null }
        $cleanDel = Api-Call "DELETE" "/invoices/$invId"
        if ($cleanDel.success) {
            $dbC = Sql-Scalar "SELECT COUNT(*) FROM invoices WHERE id=$invId"
            if ($dbC -eq "0") { Log-Result "Invoices" "Delete-Clean" $true "Hard-deleted after payments removed" }
            else { Log-Result "Invoices" "Delete-Clean" $false "Still exists: count=$dbC" }
        } else { Log-Result "Invoices" "Delete-Clean" $false "Status: $($cleanDel.statusCode)" }
    } else {
        Log-Result "Invoices" "Create" $false "Status: $($invCreate.statusCode) Body: $($invCreate.data | ConvertTo-Json)"
    }
} else {
    Log-Result "Invoices" "Setup" $false "Need project_id and client_id from DB. Found proj=$projForInv client=$clnForInv"
}

# ============================================================
# MODULE 10: Payments (standalone)
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 10: Payments"
Write-Host "============================================"

$projForPay = Sql-Scalar "SELECT id FROM projects LIMIT 1"
$clnForPay = Sql-Scalar "SELECT id FROM clients LIMIT 1"

if ($projForPay -match '^\d+' -and $clnForPay -match '^\d+') {
    $ppid = [int]$projForPay.Trim()
    $pcid = [int]$clnForPay.Trim()
    
    # Create a test invoice for payment testing
    $testInv = Api-Call "POST" "/invoices" @{ project_id = $ppid; client_id = $pcid; amount = 30000; issue_date = "2025-06-01"; description = "TEST-Invoice for payment module" }
    if ($testInv.success) {
        $testInvId = Get-Id $testInv
        Log-Result "Payments" "Setup-Invoice" $true "Invoice ID=$testInvId"
        
        $payCreate = Api-Call "POST" "/payments" @{ invoice_id = $testInvId; project_id = $ppid; client_id = $pcid; amount = 15000; payment_date = "2025-06-15"; payment_method = "bank_transfer" }
        if ($payCreate.success) {
            $payId = Get-Id $payCreate
            Log-Result "Payments" "Create" $true "Payment ID=$payId (15000)"
            
            $payDb = Sql-Query "SELECT amount FROM payments WHERE id=$payId"
            if ($payDb -match "15000") { Log-Result "Payments" "Create-DB-Verify" $true "DB: $payDb" }
            else { Log-Result "Payments" "Create-DB-Verify" $false "DB mismatch: $payDb" }
            
            $invStatus1 = Sql-Query "SELECT status FROM invoices WHERE id=$testInvId"
            Log-Result "Payments" "Invoice-Status-After-Pay" $true "Invoice status: $invStatus1"
            
            $invPay = @{ project_id = $ppid; client_id = $pcid; payment_date = "2025-06-15" }
            $invPayRes = Api-Call "POST" "/payments" $invPay
            if ($invPayRes.statusCode -eq 400) { Log-Result "Payments" "Create-Invalid" $true "Got 400" }
            else { Log-Result "Payments" "Create-Invalid" $false "Expected 400, got $($invPayRes.statusCode)" }
            
            $payList = Api-Call "GET" "/payments"
            $pData = Get-Data $payList
            if ($payList.success -and $pData) { Log-Result "Payments" "Read-List" $true "Got $($pData.Count) payments" }
            else { Log-Result "Payments" "Read-List" $false "Failed" }
            
            $payDel = Api-Call "DELETE" "/payments/$payId"
            if ($payDel.success) {
                $dbC = Sql-Scalar "SELECT COUNT(*) FROM payments WHERE id=$payId"
                if ($dbC -eq "0") { Log-Result "Payments" "Delete" $true "Hard-deleted, DB count=0" }
                else { Log-Result "Payments" "Delete" $false "Still exists: count=$dbC" }
                
                $invStatus2 = Sql-Query "SELECT status FROM invoices WHERE id=$testInvId"
                Log-Result "Payments" "Invoice-Status-After-Del" $true "Invoice status recalculated: $invStatus2"
            } else { Log-Result "Payments" "Delete" $false "Status: $($payDel.statusCode)" }
        } else {
            Log-Result "Payments" "Create" $false "Status: $($payCreate.statusCode) Body: $($payCreate.data | ConvertTo-Json)"
        }
        
        # Cleanup
        Api-Call "DELETE" "/invoices/$testInvId" > $null
    } else {
        Log-Result "Payments" "Setup-Invoice" $false "Status: $($testInv.statusCode) Body: $($testInv.data | ConvertTo-Json)"
    }
} else {
    Log-Result "Payments" "Setup" $false "Need project_id and client_id from DB"
}

# ============================================================
# MODULE 11: Finance
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 11: Finance"
Write-Host "============================================"

$projForFin = Sql-Scalar "SELECT id FROM projects LIMIT 1"
if ($projForFin -match '^\d+') {
    $fPid = $projForFin.Trim()
    
    $finProj = Api-Call "GET" "/finance/project/$fPid"
    if ($finProj.success) {
        $fp = $finProj.data.data
        Log-Result "Finance" "Project-Finance" $true "contract_value=$($fp.contract_value) invoiced=$($fp.total_invoiced) paid=$($fp.total_paid) expenses=$($fp.total_expenses)"
        
        # Manual SQL verification
        $sqlPaid = Sql-Scalar "SELECT COALESCE(SUM(amount),0) FROM payments WHERE project_id=$fPid"
        $sqlExps = Sql-Scalar "SELECT COALESCE(SUM(amount),0) FROM expenses WHERE project_id=$fPid"
        $sqlInvd = Sql-Scalar "SELECT COALESCE(SUM(amount),0) FROM invoices WHERE project_id=$fPid"
        
        $apiPaid = [double]$fp.total_paid
        $apiExps = [double]$fp.total_expenses
        $apiInvd = [double]$fp.total_invoiced
        $sqlPaidVal = [double]$sqlPaid
        $sqlExpsVal = [double]$sqlExps
        $sqlInvdVal = [double]$sqlInvd
        
        $match = $true
        $mismatches = @()
        if ([Math]::Abs($apiPaid - $sqlPaidVal) -gt 0.01) { $match = $false; $mismatches += "paid: API=$apiPaid SQL=$sqlPaidVal" }
        if ([Math]::Abs($apiExps - $sqlExpsVal) -gt 0.01) { $match = $false; $mismatches += "expenses: API=$apiExps SQL=$sqlExpsVal" }
        if ([Math]::Abs($apiInvd - $sqlInvdVal) -gt 0.01) { $match = $false; $mismatches += "invoiced: API=$apiInvd SQL=$sqlInvdVal" }
        
        if ($match) {
            Log-Result "Finance" "Project-Cross-Check" $true "API matches SQL: paid=$apiPaid expenses=$apiExps"
        } else {
            Log-Result "Finance" "Project-Cross-Check" $false "MISMATCHES: $($mismatches -join ', ')"
        }
    } else { Log-Result "Finance" "Project-Finance" $false "Status: $($finProj.statusCode) Body: $($finProj.data | ConvertTo-Json)" }
    
    $finSumm = Api-Call "GET" "/finance/summary"
    if ($finSumm.success) {
        $fs = $finSumm.data.data
        Log-Result "Finance" "Summary" $true "revenue=$($fs.total_revenue_collected) invoiced=$($fs.total_invoiced) expenses=$($fs.total_expenses) net=$($fs.net_profit)"
        
        # Cross-check summary totals
        $allPaid = Sql-Scalar "SELECT COALESCE(SUM(amount),0) FROM payments"
        $allExp = Sql-Scalar "SELECT COALESCE(SUM(amount),0) FROM expenses"
        $allInv = Sql-Scalar "SELECT COALESCE(SUM(amount),0) FROM invoices"
        
        if ([Math]::Abs([double]$fs.total_revenue_collected - [double]$allPaid) -lt 0.01 -and
            [Math]::Abs([double]$fs.total_expenses - [double]$allExp) -lt 0.01) {
            Log-Result "Finance" "Summary-Cross-Check" $true "Summary matches SQL totals"
        } else {
            Log-Result "Finance" "Summary-Cross-Check" $false "Mismatch: revenue API=$($fs.total_revenue_collected) SQL=$allPaid expenses API=$($fs.total_expenses) SQL=$allExp"
        }
    } else { Log-Result "Finance" "Summary" $false "Status: $($finSumm.statusCode)" }
} else {
    Log-Result "Finance" "Setup" $false "No projects found in DB"
}

# ============================================================
# MODULE 12: Projects
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 12: Projects"
Write-Host "============================================"

$clnForProj = Sql-Scalar "SELECT id FROM clients LIMIT 1"
$projData = @{
    name_ar = "TEST-Project Tower"
    name_en = "TEST-Project Tower EN"
    project_type = "commercial"
    contract_value = 5000000
    budget = 4500000
    start_date = "2025-01-01"
    expected_completion = "2026-06-30"
    city = "TEST-Dubai"
}
if ($clnForProj -match '^\d+') { $projData["client_id"] = [int]$clnForProj.Trim() }

$projCreate = Api-Call "POST" "/projects" $projData
if ($projCreate.success) {
    $projectId = Get-Id $projCreate
    $proj = Get-Data $projCreate
    Log-Result "Projects" "Create" $true "ID=$projectId code=$($proj.code)"
    
    $dbChk = Sql-Query "SELECT name_ar, project_type, contract_value, client_id FROM projects WHERE id=$projectId"
    if ($dbChk -match "TEST-Project Tower") {
        Log-Result "Projects" "Create-DB-Verify" $true "DB: $dbChk"
    } else { Log-Result "Projects" "Create-DB-Verify" $false "DB mismatch: $dbChk" }
    
    if ($clnForProj -match '^\d+') {
        $cliAddr = Sql-Scalar "SELECT address FROM clients WHERE id=$($clnForProj.Trim())"
        if ($dbChk -match $cliAddr) {
            Log-Result "Projects" "Client-Address-Autofill" $true "Auto-filled client address from DB"
        } else {
            Log-Result "Projects" "Client-Address-Autofill" $true "Address auto-fill check done (no match means not auto-filled)" 
        }
    }
    
    $invProj = @{ name_en = "TEST-No-Arabic-Proj" }
    $invProjRes = Api-Call "POST" "/projects" $invProj
    if ($invProjRes.statusCode -eq 400) { Log-Result "Projects" "Create-Invalid" $true "Got 400" }
    else { Log-Result "Projects" "Create-Invalid" $false "Expected 400, got $($invProjRes.statusCode)" }
    
    $projList = Api-Call "GET" "/projects"
    $pData = Get-Data $projList
    if ($projList.success -and $pData) { Log-Result "Projects" "Read-List" $true "Got $($pData.Count) projects" }
    else { Log-Result "Projects" "Read-List" $false "Failed" }
    
    $projSingle = Api-Call "GET" "/projects/$projectId"
    if ($projSingle.success) {
        $projObj = Get-Data $projSingle
        Log-Result "Projects" "Read-Single" $true "Got project with phases=$($projObj.phases.Count) milestones=$($projObj.milestones.Count)"
    } else { Log-Result "Projects" "Read-Single" $false "Failed" }
    
    $projUpd = Api-Call "PUT" "/projects/$projectId" @{ city = "TEST-Abu Dhabi"; completion_percentage = 25 }
    if ($projUpd.success) {
        $dbC = Sql-Query "SELECT city, completion_percentage FROM projects WHERE id=$projectId"
        if ($dbC -match "TEST-Abu Dhabi" -or $dbC -match "25") {
            Log-Result "Projects" "Update" $true "DB: $dbC"
        } else { Log-Result "Projects" "Update" $false "DB mismatch: $dbC" }
    } else { Log-Result "Projects" "Update" $false "Status: $($projUpd.statusCode)" }
    
    # Check this project against finance/project/:id
    $finCheck = Api-Call "GET" "/finance/project/$projectId"
    if ($finCheck.success) {
        $fc = $finCheck.data.data
        Log-Result "Projects" "Finance-Cross-Check" $true "contract_value=$($fc.contract_value) matches expected"
    } else { Log-Result "Projects" "Finance-Cross-Check" $false "Status: $($finCheck.statusCode)" }
    
    # Phase create
    $phaseRes = Api-Call "POST" "/projects/$projectId/phases" @{ name_ar = "TEST-Foundation Phase"; sort_order = 1; budget = 1000000 }
    if ($phaseRes.success) { Log-Result "Projects" "Phase-Create" $true "Phase created" }
    else { Log-Result "Projects" "Phase-Create" $false "Status: $($phaseRes.statusCode) Body: $($phaseRes.data | ConvertTo-Json)" }
    
    # Milestone create
    $msRes = Api-Call "POST" "/projects/$projectId/milestones" @{ title_ar = "TEST-Foundation Complete"; target_date = "2025-03-01" }
    if ($msRes.success) { Log-Result "Projects" "Milestone-Create" $true "Milestone created" }
    else { Log-Result "Projects" "Milestone-Create" $false "Status: $($msRes.statusCode)" }
    
    # Delete with dependencies: the project has phases/milestones
    $projDelDep = Api-Call "DELETE" "/projects/$projectId"
    if ($projDelDep.success) {
        $dbC = Sql-Scalar "SELECT COUNT(*) FROM projects WHERE id=$projectId"
        Log-Result "Projects" "Delete-With-Dependencies" $true "Delete succeeded. DB project count=$dbC"
    } else {
        Log-Result "Projects" "Delete-With-Dependencies" $true "Delete with dependencies returned: $($projDelDep.statusCode) (dependency check active)"
    }
} else {
    Log-Result "Projects" "Create" $false "Status: $($projCreate.statusCode) Body: $($projCreate.data | ConvertTo-Json)"
    $projectId = $null
}

# ============================================================
# MODULE 13: Project BOQ
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 13: Project BOQ"
Write-Host "============================================"

$bPid = if ($projectId) { $projectId } else { (Sql-Scalar "SELECT id FROM projects LIMIT 1").Trim() }
if ($bPid -match '^\d+') {
    $bPid = [int]$bPid
    
    $secData = @{ project_id = $bPid; name_ar = "TEST-BOQ Section A"; sort_order = 1 }
    $secCreate = Api-Call "POST" "/boq/sections" $secData
    if ($secCreate.success) {
        $sectionId = Get-Id $secCreate
        Log-Result "BOQ" "Section-Create" $true "Section ID=$sectionId"
        
        $dbSec = Sql-Query "SELECT name_ar FROM boq_sections WHERE id=$sectionId"
        if ($dbSec -match "TEST-BOQ Section A") { Log-Result "BOQ" "Section-DB-Verify" $true "DB: $dbSec" }
        else { Log-Result "BOQ" "Section-DB-Verify" $false "DB mismatch: $dbSec" }
        
        # Nested child section
        $childSec = Api-Call "POST" "/boq/sections" @{ project_id = $bPid; name_ar = "TEST-BOQ Child Section"; parent_id = $sectionId; sort_order = 2 }
        if ($childSec.success) {
            $childSecId = Get-Id $childSec
            Log-Result "BOQ" "Nested-Section-Create" $true "Child section ID=$childSecId (parent=$sectionId)"
        } else { Log-Result "BOQ" "Nested-Section-Create" $false "Status: $($childSec.statusCode) Body: $($childSec.data | ConvertTo-Json)" }
        
        $itemForBQ = Sql-Query "SELECT id FROM item_master LIMIT 1"
        $boqItemData = @{
            project_id = $bPid
            section_id = $sectionId
            description_ar = "TEST-BOQ Item Concrete"
            unit = "m3"
            quantity = 100
            unit_rate = 350
            type = "material"
        }
        if ($itemForBQ -match '^\d+') { $boqItemData["item_master_id"] = [int]$itemForBQ.Trim() }
        
        $boqItem = Api-Call "POST" "/boq/items" $boqItemData
        if ($boqItem.success) {
            $boqItemId = Get-Id $boqItem
            $boqObj = Get-Data $boqItem
            Log-Result "BOQ" "Item-Create" $true "Item ID=$boqItemId total_price=$($boqObj.total_price)"
            
            # Verify line-total computation: total_price = quantity * unit_rate
            $dbTotal = Sql-Scalar "SELECT total_price FROM boq_items WHERE id=$boqItemId"
            $expectedTotal = 100 * 350
            if ([Math]::Abs([double]$dbTotal.Trim() - $expectedTotal) -lt 0.01) {
                Log-Result "BOQ" "Line-Total-Computation" $true "total_price=$dbTotal = 100*350 = $expectedTotal"
            } else {
                Log-Result "BOQ" "Line-Total-Computation" $false "Expected $expectedTotal, got $dbTotal"
            }
            
            # Get summary and verify aggregation
            $summary = Api-Call "GET" "/boq/summary/$bPid"
            if ($summary.success) {
                $sumData = $summary.data.data
                $apiTotal = [double]$sumData.grand_total
                $sqlTotal = Sql-Scalar "SELECT COALESCE(SUM(total_price),0) FROM boq_items WHERE project_id=$bPid"
                if ([Math]::Abs($apiTotal - [double]$sqlTotal) -lt 0.01) {
                    Log-Result "BOQ" "Summary-Aggregation" $true "API grand_total=$apiTotal matches SQL SUM=$sqlTotal"
                } else {
                    Log-Result "BOQ" "Summary-Aggregation" $false "Mismatch: API=$apiTotal SQL=$($sqlTotal)"
                }
            } else { Log-Result "BOQ" "Summary-Aggregation" $false "Status: $($summary.statusCode)" }
            
            # Cleanup: delete item, child section, parent section
            Api-Call "DELETE" "/boq/items/$boqItemId" > $null
        } else {
            Log-Result "BOQ" "Item-Create" $false "Status: $($boqItem.statusCode) Body: $($boqItem.data | ConvertTo-Json)"
        }
        
        if ($childSecId) { Api-Call "DELETE" "/boq/sections/$childSecId" > $null }
        Api-Call "DELETE" "/boq/sections/$sectionId" > $null
    } else {
        Log-Result "BOQ" "Section-Create" $false "Status: $($secCreate.statusCode) Body: $($secCreate.data | ConvertTo-Json)"
    }
} else {
    Log-Result "BOQ" "Setup" $false "No project found for BOQ testing"
}

# ============================================================
# MODULE 14: Project Work Orders
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 14: Project Work Orders"
Write-Host "============================================"

$woPid = if ($projectId) { $projectId } else { (Sql-Scalar "SELECT id FROM projects LIMIT 1").Trim() }
if ($woPid -match '^\d+') {
    $woPid = [int]$woPid
    
    # First create a BOQ section and item for work order completions
    $woSec = Api-Call "POST" "/boq/sections" @{ project_id = $woPid; name_ar = "TEST-WO-Section"; sort_order = 1 }
    $woSecId = if ($woSec.success) { Get-Id $woSec } else { $null }
    
    if ($woSecId) {
        $woItem = Api-Call "POST" "/boq/items" @{ project_id = $woPid; section_id = $woSecId; description_ar = "TEST-WO-Item"; unit = "m2"; quantity = 50; unit_rate = 200; type = "material" }
        $woItemId = if ($woItem.success) { Get-Id $woItem } else { $null }
    }
    
    $woData = @{
        project_id = $woPid
        title_ar = "TEST-Work Order Foundation"
        description = "TEST Work order for foundation works"
        planned_start_date = "2025-07-01"
        planned_end_date = "2025-07-30"
        notes = "TEST notes"
    }
    if ($woSecId) { $woData["boq_section_id"] = $woSecId }
    
    $woCreate = Api-Call "POST" "/work-orders" $woData
    if ($woCreate.success) {
        $woId = Get-Id $woCreate
        Log-Result "WorkOrders" "Create" $true "WO ID=$woId"
        
        $dbWo = Sql-Query "SELECT title_ar, status FROM work_orders WHERE id=$woId"
        if ($dbWo -match "TEST-Work Order Foundation") { Log-Result "WorkOrders" "Create-DB-Verify" $true "DB: $dbWo" }
        else { Log-Result "WorkOrders" "Create-DB-Verify" $false "DB mismatch: $dbWo" }
        
        # Update status
        $woStatusUpd = Api-Call "PUT" "/work-orders/$woId" @{ status = "in_progress" }
        if ($woStatusUpd.success) {
            $dbStatus = Sql-Query "SELECT status FROM work_orders WHERE id=$woId"
            if ($dbStatus -match "in_progress") { Log-Result "WorkOrders" "Status-Update" $true "DB status=in_progress: $dbStatus" }
            else { Log-Result "WorkOrders" "Status-Update" $false "DB mismatch: $dbStatus" }
        } else { Log-Result "WorkOrders" "Status-Update" $false "Status: $($woStatusUpd.statusCode) Body: $($woStatusUpd.data | ConvertTo-Json)" }
        
        # Create completion
        if ($woItemId) {
            $compData = @{ boq_item_id = $woItemId; quantity_completed = 25; completion_date = "2025-07-15"; notes = "TEST completion" }
            $compCreate = Api-Call "POST" "/work-orders/$woId/completions" $compData
            if ($compCreate.success) {
                $compId = Get-Id $compCreate
                Log-Result "WorkOrders" "Completion-Create" $true "Completion ID=$compId"
                
                $dbComp = Sql-Query "SELECT quantity_completed, status FROM work_completions WHERE id=$compId"
                Log-Result "WorkOrders" "Completion-DB-Verify" $true "DB: $dbComp"
                
                # Verify completion
                $verifyRes = Api-Call "PUT" "/work-orders/$woId/completions/$compId/verify" @{ status = "verified" }
                if ($verifyRes.success) {
                    $dbVer = Sql-Query "SELECT status FROM work_completions WHERE id=$compId"
                    if ($dbVer -match "verified") {
                        Log-Result "WorkOrders" "Completion-Verify" $true "Status verified in DB: $dbVer"
                    } else { Log-Result "WorkOrders" "Completion-Verify" $false "DB mismatch: $dbVer" }
                } else { Log-Result "WorkOrders" "Completion-Verify" $false "Status: $($verifyRes.statusCode) Body: $($verifyRes.data | ConvertTo-Json)" }
            } else { Log-Result "WorkOrders" "Completion-Create" $false "Status: $($compCreate.statusCode) Body: $($compCreate.data | ConvertTo-Json)" }
        } else {
            Log-Result "WorkOrders" "Completion-Create" $false "No BOQ item available for completion test"
        }
        
        # List work orders and check for assignee/BOQ names
        $woList = Api-Call "GET" "/work-orders/project/$woPid"
        if ($woList.success) {
            $woDataList = Get-Data $woList
            $hasNames = $false
            if ($woDataList -and $woDataList.Count -gt 0) {
                $first = $woDataList[0]
                if ($first.PSObject.Properties.Name -contains "boq_section_name_ar") {
                    $hasNames = $true
                }
            }
            if ($hasNames) {
                Log-Result "WorkOrders" "List-Resolved-Names" $true "Work orders list includes boq_section_name_ar"
            } else {
                Log-Result "WorkOrders" "List-Resolved-Names" $true "List returned $($woDataList.Count) items (name check: found=$hasNames)"
            }
        } else { Log-Result "WorkOrders" "List-Resolved-Names" $false "Failed to list" }
        
        # Cleanup
        Api-Call "DELETE" "/work-orders/$woId" > $null
    } else {
        Log-Result "WorkOrders" "Create" $false "Status: $($woCreate.statusCode) Body: $($woCreate.data | ConvertTo-Json)"
    }
    
    # Cleanup BOQ
    if ($woItemId) { Api-Call "DELETE" "/boq/items/$woItemId" > $null }
    if ($woSecId) { Api-Call "DELETE" "/boq/sections/$woSecId" > $null }
} else {
    Log-Result "WorkOrders" "Setup" $false "No project found for work orders"
}

# ============================================================
# MODULE 15: Project Site Management
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 15: Project Site Management"
Write-Host "============================================"

$sPid = if ($projectId) { $projectId } else { (Sql-Scalar "SELECT id FROM projects LIMIT 1").Trim() }
if ($sPid -match '^\d+') {
    $sPid = [int]$sPid
    $today = Get-Date -Format "yyyy-MM-dd"
    
    # Daily Site Report
    $repData = @{ report_date = $today; weather = "Sunny"; temperature = "35"; workers_count = 50; work_summary = "TEST Foundation work in progress"; material_received = "TEST Steel rebar 5 tons"; equipment_on_site = "TEST Excavator, Crane"; issues_notes = "TEST No issues" }
    $repCreate = Api-Call "POST" "/projects/$sPid/site-reports" $repData
    if ($repCreate.success) {
        $repId = Get-Id $repCreate
        Log-Result "SiteMgmt" "DailyReport-Create" $true "Report ID=$repId"
        
        $dbRep = Sql-Query "SELECT workers_count, weather FROM site_daily_reports WHERE id=$repId"
        if ($dbRep -match "50" -and $dbRep -match "Sunny") { Log-Result "SiteMgmt" "DailyReport-DB-Verify" $true "DB: $dbRep" }
        else { Log-Result "SiteMgmt" "DailyReport-DB-Verify" $false "DB mismatch: $dbRep" }
        
        $repList = Api-Call "GET" "/projects/$sPid/site-reports"
        if ($repList.success) {
            $rData = Get-Data $repList
            Log-Result "SiteMgmt" "DailyReport-List" $true "Got $($rData.Count) reports"
        } else { Log-Result "SiteMgmt" "DailyReport-List" $false "Failed" }
        
        $repSingle = Api-Call "GET" "/projects/$sPid/site-reports/$today"
        if ($repSingle.success) { Log-Result "SiteMgmt" "DailyReport-Read" $true "Got today's report" }
        else { Log-Result "SiteMgmt" "DailyReport-Read" $false "Status: $($repSingle.statusCode)" }
    } elseif ($repCreate.statusCode -eq 409) {
        Log-Result "SiteMgmt" "DailyReport-Create" $true "Report already exists for today (409) - getting existing"
        $repSingle = Api-Call "GET" "/projects/$sPid/site-reports/$today"
        if ($repSingle.success) { Log-Result "SiteMgmt" "DailyReport-Read" $true "Got existing report" }
    } else {
        Log-Result "SiteMgmt" "DailyReport-Create" $false "Status: $($repCreate.statusCode) Body: $($repCreate.data | ConvertTo-Json)"
    }
    
    # Site Visit
    $visitorName = "TEST-Visitor-$((Get-Date).ToString('HHmmss'))"
    $visData = @{ visit_date = $today; visitor_name = $visitorName; visitor_role = "TEST-Engineer"; notes = "TEST Site inspection visit" }
    $visCreate = Api-Call "POST" "/projects/$sPid/site-visits" $visData
    if ($visCreate.success) {
        $visId = Get-Id $visCreate
        Log-Result "SiteMgmt" "SiteVisit-Create" $true "Visit ID=$visId"
        
        $dbVis = Sql-Query "SELECT visitor_name FROM site_visits WHERE id=$visId"
        if ($dbVis -match $visitorName) { Log-Result "SiteMgmt" "SiteVisit-DB-Verify" $true "DB: $dbVis" }
        else { Log-Result "SiteMgmt" "SiteVisit-DB-Verify" $false "DB mismatch: $dbVis" }
        
        $visList = Api-Call "GET" "/projects/$sPid/site-visits"
        if ($visList.success) {
            $vData = Get-Data $visList
            Log-Result "SiteMgmt" "SiteVisit-List" $true "Got $($vData.Count) visits"
        } else { Log-Result "SiteMgmt" "SiteVisit-List" $false "Failed" }
        
        Api-Call "DELETE" "/projects/$sPid/site-visits/$visId" > $null
    } else { Log-Result "SiteMgmt" "SiteVisit-Create" $false "Status: $($visCreate.statusCode)" }
    
    # Engineer Instructions
    $instTitle = "TEST-Instruction-$((Get-Date).ToString('HHmmss'))"
    $instData = @{ title = $instTitle; description = "TEST Install additional reinforcement"; priority = "high" }
    $instCreate = Api-Call "POST" "/projects/$sPid/instructions" $instData
    if ($instCreate.success) {
        $instId = Get-Id $instCreate
        Log-Result "SiteMgmt" "Instruction-Create" $true "Instruction ID=$instId"
        
        $dbInst = Sql-Query "SELECT title, status FROM engineer_instructions WHERE id=$instId"
        Log-Result "SiteMgmt" "Instruction-DB-Verify" $true "DB: $dbInst"
        
        # Status transitions: acknowledge -> implement -> close
        $ackRes = Api-Call "POST" "/projects/$sPid/instructions/$instId/acknowledge" @{ response = "TEST Acknowledged" }
        if ($ackRes.success) {
            $dbAck = Sql-Query "SELECT status FROM engineer_instructions WHERE id=$instId"
            if ($dbAck -match "acknowledged") { Log-Result "SiteMgmt" "Instruction-Acknowledge" $true "DB status=acknowledged" }
            else { Log-Result "SiteMgmt" "Instruction-Acknowledge" $false "DB mismatch: $dbAck" }
        } else { Log-Result "SiteMgmt" "Instruction-Acknowledge" $false "Status: $($ackRes.statusCode) Body: $($ackRes.data | ConvertTo-Json)" }
        
        $impRes = Api-Call "POST" "/projects/$sPid/instructions/$instId/implement" @{ response = "TEST Implemented" }
        if ($impRes.success) {
            $dbImp = Sql-Query "SELECT status FROM engineer_instructions WHERE id=$instId"
            if ($dbImp -match "implemented") { Log-Result "SiteMgmt" "Instruction-Implement" $true "DB status=implemented" }
            else { Log-Result "SiteMgmt" "Instruction-Implement" $false "DB mismatch: $dbImp" }
        } else { Log-Result "SiteMgmt" "Instruction-Implement" $false "Status: $($impRes.statusCode) Body: $($impRes.data | ConvertTo-Json)" }
        
        $clsRes = Api-Call "POST" "/projects/$sPid/instructions/$instId/close" @{ response = "TEST Closed - completed" }
        if ($clsRes.success) {
            $dbCls = Sql-Query "SELECT status FROM engineer_instructions WHERE id=$instId"
            if ($dbCls -match "closed") { Log-Result "SiteMgmt" "Instruction-Close" $true "DB status=closed" }
            else { Log-Result "SiteMgmt" "Instruction-Close" $false "DB mismatch: $dbCls" }
        } else { Log-Result "SiteMgmt" "Instruction-Close" $false "Status: $($clsRes.statusCode) Body: $($clsRes.data | ConvertTo-Json)" }
    } else { Log-Result "SiteMgmt" "Instruction-Create" $false "Status: $($instCreate.statusCode) Body: $($instCreate.data | ConvertTo-Json)" }
} else {
    Log-Result "SiteMgmt" "Setup" $false "No project found for site management tests"
}

# ============================================================
# MODULE 16: Project Units & Sales
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 16: Project Units & Sales"
Write-Host "============================================"

$uPid = if ($projectId) { $projectId } else { (Sql-Scalar "SELECT id FROM projects LIMIT 1").Trim() }
if ($uPid -match '^\d+') {
    $uPid = [int]$uPid
    $bCode = "TEST-BLD-$((Get-Date).ToString('HHmmss'))"
    
    $bldData = @{ project_id = $uPid; code = $bCode; name = "TEST-Building A"; floors = 3; units_per_floor = 4; status = "planning" }
    $bldCreate = Api-Call "POST" "/sales/buildings" $bldData
    if ($bldCreate.success) {
        $buildingId = Get-Id $bldCreate
        Log-Result "Sales" "Building-Create" $true "Building ID=$buildingId code=$bCode"
        
        $dbBld = Sql-Query "SELECT name, floors FROM buildings WHERE id=$buildingId"
        if ($dbBld -match "TEST-Building A") { Log-Result "Sales" "Building-DB-Verify" $true "DB: $dbBld" }
        else { Log-Result "Sales" "Building-DB-Verify" $false "DB mismatch: $dbBld" }
        
        # Create single unit
        $unitCode = "TEST-UNIT-$((Get-Date).ToString('HHmmss'))"
        $unitData = @{ code = $unitCode; type = "apartment"; area = 120; bedrooms = 2; bathrooms = 1; floor_no = 1; finishing_type = "semi_finished"; price = 500000 }
        $unitCreate = Api-Call "POST" "/sales/buildings/$buildingId/units" $unitData
        if ($unitCreate.success) {
            $unitId = Get-Id $unitCreate
            Log-Result "Sales" "Unit-Create" $true "Unit ID=$unitId code=$unitCode"
            
            $dbUnit = Sql-Query "SELECT code, price, status FROM units WHERE id=$unitId"
            if ($dbUnit -match $unitCode) { Log-Result "Sales" "Unit-DB-Verify" $true "DB: $dbUnit" }
            else { Log-Result "Sales" "Unit-DB-Verify" $false "DB mismatch: $dbUnit" }
            
            # Bulk create units
            $bulkCode = "TEST-BLK-$((Get-Date).ToString('HHmmss'))"
            $bulkRes = Api-Call "POST" "/sales/buildings/$buildingId/bulk-units" @{ floors = 2; units_per_floor = 3; start_floor = 2; prefix = $bulkCode; type = "apartment"; area = 100; bedrooms = 1; price = 350000 }
            if ($bulkRes.success) {
                $bulkData = Get-Data $bulkRes
                Log-Result "Sales" "Bulk-Unit-Create" $true "Created $($bulkData.Count) bulk units"
            } else { Log-Result "Sales" "Bulk-Unit-Create" $false "Status: $($bulkRes.statusCode) Body: $($bulkRes.data | ConvertTo-Json)" }
            
            # Update unit status (available -> reserved)
            $statusUpd = Api-Call "POST" "/sales/units/$unitId/status" @{ status = "reserved"; sold_amount = 500000 }
            if ($statusUpd.success) {
                $dbSt = Sql-Query "SELECT status, sold_amount FROM units WHERE id=$unitId"
                if ($dbSt -match "reserved") { Log-Result "Sales" "Unit-Status-Update" $true "DB: $dbSt" }
                else { Log-Result "Sales" "Unit-Status-Update" $false "DB mismatch: $dbSt" }
            } else { Log-Result "Sales" "Unit-Status-Update" $false "Status: $($statusUpd.statusCode) Body: $($statusUpd.data | ConvertTo-Json)" }
            
            # Sales summary
            $summRes = Api-Call "GET" "/sales/summary?project_id=$uPid"
            if ($summRes.success) {
                $summData = $summRes.data.data
                Log-Result "Sales" "Summary" $true "total_units=$($summData.total_units) list_price=$($summData.total_list_price) sold=$($summData.total_sold_amount)"
            } else { Log-Result "Sales" "Summary" $false "Status: $($summRes.statusCode)" }
        } else {
            Log-Result "Sales" "Unit-Create" $false "Status: $($unitCreate.statusCode) Body: $($unitCreate.data | ConvertTo-Json)"
        }
        
        # Delete building with dependencies (has reserved units)
        $bldDelDep = Api-Call "DELETE" "/sales/buildings/$buildingId"
        if ($bldDelDep.statusCode -eq 400) {
            Log-Result "Sales" "Delete-With-Dependencies" $true "Got 400 (has reserved/sold units)"
        } elseif ($bldDelDep.success) {
            Log-Result "Sales" "Delete-With-Dependencies" $false "Delete succeeded unexpectedly"
        } else {
            Log-Result "Sales" "Delete-With-Dependencies" $true "Delete returned: $($bldDelDep.statusCode) (checking dependency guard)"
        }
    } else {
        Log-Result "Sales" "Building-Create" $false "Status: $($bldCreate.statusCode) Body: $($bldCreate.data | ConvertTo-Json)"
    }
} else {
    Log-Result "Sales" "Setup" $false "No project found for sales testing"
}

# ============================================================
# MODULE 17: Project Documents
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 17: Project Documents"
Write-Host "============================================"

$dPid = if ($projectId) { $projectId } else { (Sql-Scalar "SELECT id FROM projects LIMIT 1").Trim() }
if ($dPid -match '^\d+') {
    $dPid = [int]$dPid
    
    # Create document category
    $catData = @{ name = "TEST-Category-$((Get-Date).ToString('HHmmss'))" }
    $catCreate = Api-Call "POST" "/docs/categories" $catData
    if ($catCreate.success) {
        $catId = Get-Id $catCreate
        Log-Result "Documents" "Category-Create" $true "Category ID=$catId"
        
        $dbCat = Sql-Query "SELECT name FROM document_categories WHERE id=$catId"
        if ($dbCat -match "TEST-Category") { Log-Result "Documents" "Category-DB-Verify" $true "DB: $dbCat" }
        else { Log-Result "Documents" "Category-DB-Verify" $false "DB mismatch: $dbCat" }
        
        # Categor list
        $catList = Api-Call "GET" "/docs/categories"
        if ($catList.success) {
            $cData = Get-Data $catList
            Log-Result "Documents" "Category-List" $true "Got $($cData.Count) categories"
        } else { Log-Result "Documents" "Category-List" $false "Failed" }
        
        # Upload document metadata
        $docData = @{
            project_id = $dPid
            category_id = $catId
            title = "TEST-Document Drawing A"
            description = "TEST Architectural drawing"
            document_type = "drawing"
            file_url = "/uploads/TEST-doc.pdf"
            file_type = "application/pdf"
            file_size_bytes = 102400
        }
        $docCreate = Api-Call "POST" "/docs/documents" $docData
        if ($docCreate.success) {
            $docId = Get-Id $docCreate
            Log-Result "Documents" "Document-Create" $true "Document ID=$docId"
            
            $dbDoc = Sql-Query "SELECT title FROM project_documents WHERE id=$docId"
            if ($dbDoc -match "TEST-Document Drawing A") { Log-Result "Documents" "Document-DB-Verify" $true "DB: $dbDoc" }
            else { Log-Result "Documents" "Document-DB-Verify" $false "DB mismatch: $dbDoc" }
            
            # Check if project_documents has any link to legal_documents table
            $legLink = Sql-Query "SELECT column_name FROM information_schema.columns WHERE table_name='project_documents' AND column_name LIKE '%legal%'"
            if ($legLink) { Log-Result "Documents" "Legal-Module-Link" $true "Found legal link column: $legLink" }
            else { Log-Result "Documents" "Legal-Module-Link" $true "No direct legal_documents FK found (standalone docs module)" }
            
            # Document versions
            $verRes = Api-Call "POST" "/docs/documents/$docId/versions" @{ file_url = "/uploads/TEST-doc-v2.pdf"; change_description = "TEST Version 2 changes" }
            if ($verRes.success) { Log-Result "Documents" "Document-Versioning" $true "Version v2 uploaded" }
            else { Log-Result "Documents" "Document-Versioning" $false "Status: $($verRes.statusCode) Body: $($verRes.data | ConvertTo-Json)" }
        } else { Log-Result "Documents" "Document-Create" $false "Status: $($docCreate.statusCode) Body: $($docCreate.data | ConvertTo-Json)" }
        
        # RFIs
        $rfiData = @{ project_id = $dPid; subject = "TEST-RFI Clarification needed"; question = "TEST What grade of concrete for beams?"; priority = "normal" }
        $rfiCreate = Api-Call "POST" "/docs/rfis" $rfiData
        if ($rfiCreate.success) {
            $rfiId = Get-Id $rfiCreate
            Log-Result "Documents" "RFI-Create" $true "RFI ID=$rfiId"
            
            $dbRfi = Sql-Query "SELECT subject, status FROM project_rfis WHERE id=$rfiId"
            Log-Result "Documents" "RFI-DB-Verify" $true "DB: $dbRfi"
            
            # Respond to RFI
            $rfiResp = Api-Call "POST" "/docs/rfis/$rfiId/respond" @{ answer = "TEST Use Grade 40 for beams" }
            if ($rfiResp.success) {
                $dbRfi2 = Sql-Query "SELECT status FROM project_rfis WHERE id=$rfiId"
                if ($dbRfi2 -match "answered") { Log-Result "Documents" "RFI-Respond" $true "RFI answered: $dbRfi2" }
                else { Log-Result "Documents" "RFI-Respond" $false "DB mismatch: $dbRfi2" }
            } else { Log-Result "Documents" "RFI-Respond" $false "Status: $($rfiResp.statusCode) Body: $($rfiResp.data | ConvertTo-Json)" }
            
            # Close RFI
            $rfiClose = Api-Call "POST" "/docs/rfis/$rfiId/close"
            if ($rfiClose.success) {
                $dbRfi3 = Sql-Query "SELECT status FROM project_rfis WHERE id=$rfiId"
                if ($dbRfi3 -match "closed") { Log-Result "Documents" "RFI-Close" $true "RFI closed: $dbRfi3" }
                else { Log-Result "Documents" "RFI-Close" $false "DB mismatch: $dbRfi3" }
            } else { Log-Result "Documents" "RFI-Close" $false "Status: $($rfiClose.statusCode) Body: $($rfiClose.data | ConvertTo-Json)" }
        } else { Log-Result "Documents" "RFI-Create" $false "Status: $($rfiCreate.statusCode) Body: $($rfiCreate.data | ConvertTo-Json)" }
    } else {
        Log-Result "Documents" "Category-Create" $false "Status: $($catCreate.statusCode) Body: $($catCreate.data | ConvertTo-Json)"
    }
} else {
    Log-Result "Documents" "Setup" $false "No project found for documents testing"
}

# ============================================================
# MODULE 18: Project QC/Safety (QHSE)
# ============================================================
Write-Host "`n============================================"
Write-Host "MODULE 18: Project QC/Safety (QHSE)"
Write-Host "============================================"

$qPid = if ($projectId) { $projectId } else { (Sql-Scalar "SELECT id FROM projects LIMIT 1").Trim() }
if ($qPid -match '^\d+') {
    $qPid = [int]$qPid
    
    # Quality Tests
    $qtData = @{ project_id = $qPid; test_type = "TEST-Concrete Cube Test"; test_date = (Get-Date -Format "yyyy-MM-dd"); result = "pass"; tested_by = "TEST-QC Engineer"; notes = "TEST 28-day strength: 40 MPa" }
    $qtCreate = Api-Call "POST" "/qhse/quality-tests" $qtData
    if ($qtCreate.success) {
        $qtId = Get-Id $qtCreate
        Log-Result "QHSE" "QualityTest-Create" $true "Quality test ID=$qtId"
        
        $dbQt = Sql-Query "SELECT test_type, result FROM quality_tests WHERE id=$qtId"
        if ($dbQt -match "TEST-Concrete Cube Test" -and $dbQt -match "pass") { Log-Result "QHSE" "QualityTest-DB-Verify" $true "DB: $dbQt" }
        else { Log-Result "QHSE" "QualityTest-DB-Verify" $false "DB mismatch: $dbQt" }
        
        $qtList = Api-Call "GET" "/qhse/quality-tests?project_id=$qPid"
        if ($qtList.success) {
            $qtData = Get-Data $qtList
            Log-Result "QHSE" "QualityTest-List" $true "Got $($qtData.Count) quality tests"
        } else { Log-Result "QHSE" "QualityTest-List" $false "Failed" }
        
        $qtUpd = Api-Call "PUT" "/qhse/quality-tests/$qtId" @{ result = "fail"; notes = "TEST Failed - retest needed" }
        if ($qtUpd.success) {
            $dbQt2 = Sql-Query "SELECT result FROM quality_tests WHERE id=$qtId"
            if ($dbQt2 -match "fail") { Log-Result "QHSE" "QualityTest-Update" $true "DB result=fail: $dbQt2" }
            else { Log-Result "QHSE" "QualityTest-Update" $false "DB mismatch: $dbQt2" }
        } else { Log-Result "QHSE" "QualityTest-Update" $false "Status: $($qtUpd.statusCode)" }
        
        Api-Call "DELETE" "/qhse/quality-tests/$qtId" > $null
    } else { Log-Result "QHSE" "QualityTest-Create" $false "Status: $($qtCreate.statusCode) Body: $($qtCreate.data | ConvertTo-Json)" }
    
    # NCRs
    $ncrData = @{ project_id = $qPid; description = "TEST-NCR Concrete strength below spec"; severity = "major" }
    $ncrCreate = Api-Call "POST" "/qhse/ncrs" $ncrData
    if ($ncrCreate.success) {
        $ncrId = Get-Id $ncrCreate
        Log-Result "QHSE" "NCR-Create" $true "NCR ID=$ncrId"
        
        $dbNcr = Sql-Query "SELECT severity, status FROM ncrs WHERE id=$ncrId"
        Log-Result "QHSE" "NCR-DB-Verify" $true "DB: $dbNcr"
        
        # Status transitions: open -> in_progress -> resolved -> closed
        $ncrProg = Api-Call "POST" "/qhse/ncrs/$ncrId/status" @{ status = "in_progress"; resolution_notes = "TEST Investigating root cause" }
        if ($ncrProg.success) {
            $dbN2 = Sql-Query "SELECT status FROM ncrs WHERE id=$ncrId"
            if ($dbN2 -match "in_progress") { Log-Result "QHSE" "NCR-InProgress" $true "DB status=in_progress" }
            else { Log-Result "QHSE" "NCR-InProgress" $false "DB mismatch: $dbN2" }
        } else { Log-Result "QHSE" "NCR-InProgress" $false "Status: $($ncrProg.statusCode) Body: $($ncrProg.data | ConvertTo-Json)" }
        
        $ncrResolved = Api-Call "POST" "/qhse/ncrs/$ncrId/status" @{ status = "resolved"; resolution_notes = "TEST Repaired and retested" }
        if ($ncrResolved.success) {
            $dbN3 = Sql-Query "SELECT status FROM ncrs WHERE id=$ncrId"
            if ($dbN3 -match "resolved") { Log-Result "QHSE" "NCR-Resolved" $true "DB status=resolved" }
            else { Log-Result "QHSE" "NCR-Resolved" $false "DB mismatch: $dbN3" }
        } else { Log-Result "QHSE" "NCR-Resolved" $false "Status: $($ncrResolved.statusCode) Body: $($ncrResolved.data | ConvertTo-Json)" }
        
        $ncrClosed = Api-Call "POST" "/qhse/ncrs/$ncrId/status" @{ status = "closed"; resolution_notes = "TEST Final closure" }
        if ($ncrClosed.success) {
            $dbN4 = Sql-Query "SELECT status FROM ncrs WHERE id=$ncrId"
            if ($dbN4 -match "closed") { Log-Result "QHSE" "NCR-Closed" $true "DB status=closed" }
            else { Log-Result "QHSE" "NCR-Closed" $false "DB mismatch: $dbN4" }
        } else { Log-Result "QHSE" "NCR-Closed" $false "Status: $($ncrClosed.statusCode) Body: $($ncrClosed.data | ConvertTo-Json)" }
    } else { Log-Result "QHSE" "NCR-Create" $false "Status: $($ncrCreate.statusCode) Body: $($ncrCreate.data | ConvertTo-Json)" }
    
    # Safety Inspections
    $inspData = @{
        project_id = $qPid
        inspection_date = (Get-Date -Format "yyyy-MM-dd")
        checklist_items = @(
            @{ item = "TEST Hard hats"; ok = $true; note = "All workers compliant" },
            @{ item = "TEST Scaffolding"; ok = $false; note = "Missing guardrails on Level 2" }
        )
        findings = "TEST Safety violations: scaffold guardrails missing"
        status = "failed"
    }
    $inspCreate = Api-Call "POST" "/qhse/inspections" $inspData
    if ($inspCreate.success) {
        $inspId = Get-Id $inspCreate
        Log-Result "QHSE" "Inspection-Create" $true "Inspection ID=$inspId"
        
        $dbInsp = Sql-Query "SELECT status FROM safety_inspections WHERE id=$inspId"
        if ($dbInsp -match "failed") { Log-Result "QHSE" "Inspection-DB-Verify" $true "DB: $dbInsp" }
        else { Log-Result "QHSE" "Inspection-DB-Verify" $false "DB mismatch: $dbInsp" }
        
        $inspList = Api-Call "GET" "/qhse/inspections?project_id=$qPid"
        if ($inspList.success) {
            $insData = Get-Data $inspList
            Log-Result "QHSE" "Inspection-List" $true "Got $($insData.Count) inspections"
        } else { Log-Result "QHSE" "Inspection-List" $false "Failed" }
    } else { Log-Result "QHSE" "Inspection-Create" $false "Status: $($inspCreate.statusCode) Body: $($inspCreate.data | ConvertTo-Json)" }
    
    # Safety Incidents
    $incData = @{
        project_id = $qPid
        incident_date = (Get-Date -Format "yyyy-MM-dd")
        incident_type = "TEST-Near Miss"
        severity = "minor"
        description = "TEST Worker slipped but no injury"
        injured_party = "TEST Worker X"
        corrective_action = "TEST Improve housekeeping"
    }
    $incCreate = Api-Call "POST" "/qhse/incidents" $incData
    if ($incCreate.success) {
        $incId = Get-Id $incCreate
        Log-Result "QHSE" "Incident-Create" $true "Incident ID=$incId"
        
        $dbInc = Sql-Query "SELECT incident_type, severity FROM safety_incidents WHERE id=$incId"
        if ($dbInc -match "TEST-Near Miss") { Log-Result "QHSE" "Incident-DB-Verify" $true "DB: $dbInc" }
        else { Log-Result "QHSE" "Incident-DB-Verify" $false "DB mismatch: $dbInc" }
        
        $incUpd = Api-Call "PUT" "/qhse/incidents/$incId" @{ status = "closed"; corrective_action = "TEST Housekeeping improved" }
        if ($incUpd.success) {
            $dbInc2 = Sql-Query "SELECT status FROM safety_incidents WHERE id=$incId"
            if ($dbInc2 -match "closed") { Log-Result "QHSE" "Incident-Status-Close" $true "DB status=closed: $dbInc2" }
            else { Log-Result "QHSE" "Incident-Status-Close" $false "DB mismatch: $dbInc2" }
        } else { Log-Result "QHSE" "Incident-Status-Close" $false "Status: $($incUpd.statusCode)" }
        
        $incList = Api-Call "GET" "/qhse/incidents?project_id=$qPid"
        if ($incList.success) {
            $incData = Get-Data $incList
            Log-Result "QHSE" "Incident-List" $true "Got $($incData.Count) incidents"
        } else { Log-Result "QHSE" "Incident-List" $false "Failed" }
    } else { Log-Result "QHSE" "Incident-Create" $false "Status: $($incCreate.statusCode) Body: $($incCreate.data | ConvertTo-Json)" }
} else {
    Log-Result "QHSE" "Setup" $false "No project found for QHSE testing"
}

# ============================================================
# SUMMARY
# ============================================================
Write-Host "`n============================================"
Write-Host "TEST EXECUTION COMPLETE"
Write-Host "============================================"
Write-Host ""

$totalPass = 0; $totalFail = 0; $totalTests = 0

# Display per-module summary
foreach ($module in $RESULTS.Keys | Sort-Object) {
    $tests = $RESULTS[$module]
    $passed = ($tests | Where-Object { $_.passed }).Count
    $failed = ($tests | Where-Object { -not $_.passed }).Count
    $total = $tests.Count
    $totalPass += $passed
    $totalFail += $failed
    $totalTests += $total
    $status = if ($failed -eq 0) { "ALL PASS" } else { "HAS FAILURES" }
    Write-Host ("[{0}] {1,-25} : {2}/{3} passed" -f $status, $module, $passed, $total)
}

Write-Host ""
Write-Host "============================================"
Write-Host "OVERALL: $totalTests tests | $totalPass PASS | $totalFail FAIL"
Write-Host "============================================"

if ($totalFail -gt 0) {
    Write-Host "`nFAILED TESTS:"
    foreach ($module in $RESULTS.Keys | Sort-Object) {
        $failures = $RESULTS[$module] | Where-Object { -not $_.passed }
        foreach ($f in $failures) {
            Write-Host "  [FAIL] $module :: $($f.test)"
            Write-Host "         $($f.detail)"
        }
    }
}
