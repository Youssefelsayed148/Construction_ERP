# Comprehensive Test Suite for Construction ERP
# This runs from Windows where DB access works via trust auth

$ErrorActionPreference = "Continue"
$BASE_URL = "http://localhost:5000/api"
$TOKEN = $null
$RESULTS = @{}
$FAILURES = @()
$WARNINGS = @()

function Log-Result($module, $test, $passed, $detail) {
    if (-not $RESULTS.ContainsKey($module)) { $RESULTS[$module] = @{} }
    $RESULTS[$module][$test] = @{ passed = $passed; detail = $detail }
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
            $jsonBody = $body | ConvertTo-Json -Depth 10
            $response = Invoke-RestMethod -Uri $uri -Method $method -Headers $headers -Body $jsonBody
        } else {
            $response = Invoke-RestMethod -Uri $uri -Method $method -Headers $headers
        }
        return @{ success = $true; data = $response; statusCode = 200 }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd() | ConvertFrom-Json
        } catch {
            $responseBody = $_.Exception.Message
        }
        return @{ success = $false; data = $responseBody; statusCode = $statusCode }
    }
}

function Sql-Query($query) {
    $escapedQuery = $query -replace '"', '\"'
    $result = & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d construction_erp -t -A -c $query 2>&1
    return $result
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

# 1. CREATE
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
    $clientId = $createResult.data.data.id
    Log-Result "Clients" "Create" $true "Created client ID=$clientId"
    
    # Verify in DB
    $dbCheck = Sql-Query "SELECT name_ar, city, is_active FROM clients WHERE id=$clientId"
    if ($dbCheck -match "TEST-Client A" -and $dbCheck -match "Dubai") {
        Log-Result "Clients" "Create-DB-Verify" $true "DB row confirmed: $dbCheck"
    } else {
        Log-Result "Clients" "Create-DB-Verify" $false "DB row mismatch: $dbCheck"
    }
} else {
    Log-Result "Clients" "Create" $false "Status: $($createResult.statusCode), Body: $($createResult.data | ConvertTo-Json)"
}

# 2. CREATE INVALID
$invalidClient = @{ name_en = "TEST-No-Arabic" }
$invalidResult = Api-Call "POST" "/clients" $invalidClient
if ($invalidResult.statusCode -eq 400) {
    Log-Result "Clients" "Create-Invalid" $true "Got 400 as expected"
} else {
    Log-Result "Clients" "Create-Invalid" $false "Expected 400, got $($invalidResult.statusCode): $($invalidResult.data | ConvertTo-Json)"
}

# 3. READ LIST
if ($clientId) {
    $listResult = Api-Call "GET" "/clients"
    if ($listResult.success) {
        Log-Result "Clients" "Read-List" $true "Got $(if($listResult.data.data){$listResult.data.data.Count}else{$listResult.data.Count}) clients"
    } else {
        Log-Result "Clients" "Read-List" $false "Failed: $($listResult.statusCode)"
    }
    
    # 4. READ SINGLE
    $singleResult = Api-Call "GET" "/clients/$clientId"
    if ($singleResult.success) {
        Log-Result "Clients" "Read-Single" $true "Got client data"
        # Verify city value persisted
        $client = if($singleResult.data.data){$singleResult.data.data}else{$singleResult.data}
        if ($client.city -eq "Dubai") {
            Log-Result "Clients" "City-Persistence" $true "City value 'Dubai' persisted correctly"
        } else {
            Log-Result "Clients" "City-Persistence" $false "City mismatch: expected 'Dubai', got '$($client.city)'"
        }
    } else {
        Log-Result "Clients" "Read-Single" $false "Failed"
    }
    
    # 5. UPDATE
    $updateResult = Api-Call "PUT" "/clients/$clientId" @{ city = "Abu Dhabi"; contact_person = "TEST Updated Person" }
    if ($updateResult.success) {
        $dbCheck = Sql-Query "SELECT city, contact_person FROM clients WHERE id=$clientId"
        if ($dbCheck -match "Abu Dhabi" -and $dbCheck -match "TEST Updated Person") {
            Log-Result "Clients" "Update" $true "DB confirmed update: $dbCheck"
        } else {
            Log-Result "Clients" "Update" $false "DB mismatch after update: $dbCheck"
        }
    } else {
        Log-Result "Clients" "Update" $false "Status: $($updateResult.statusCode), Body: $($updateResult.data | ConvertTo-Json)"
    }
    
    # 6. DELETE
    $deleteResult = Api-Call "DELETE" "/clients/$clientId"
    if ($deleteResult.success) {
        $dbCheck = Sql-Query "SELECT is_active, deleted_at FROM clients WHERE id=$clientId"
        Log-Result "Clients" "Delete" $true "Delete returned success. DB state: $dbCheck"
    } else {
        Log-Result "Clients" "Delete" $false "Status: $($deleteResult.statusCode), Body: $($deleteResult.data | ConvertTo-Json)"
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
    $supplierId = $supCreate.data.data.id
    Log-Result "Suppliers" "Create" $true "ID=$supplierId"
    
    # Verify city in DB
    $dbCheck = Sql-Query "SELECT name_ar, city, specialty FROM suppliers WHERE id=$supplierId"
    if ($dbCheck -match "TEST-Supplier A" -and $dbCheck -match "Sharjah") {
        Log-Result "Suppliers" "Create-DB" $true "DB confirmed: $dbCheck"
    } else {
        Log-Result "Suppliers" "Create-DB" $false "DB mismatch: $dbCheck"
    }
    
    # Get an inventory item to link
    $itemCheck = Sql-Query "SELECT id FROM item_master LIMIT 1"
    if ($itemCheck -match "^\d+") {
        $itemId = ($itemCheck -replace '\s','').Trim()
        # Link material to supplier
        $linkData = @{ material_id = [int]$itemId; unit_price = 150.00; lead_time_days = 7 }
        $linkResult = Api-Call "POST" "/suppliers/$supplierId/materials" $linkData
        if ($linkResult.success) {
            Log-Result "Suppliers" "Material-Link" $true "Linked item $itemId to supplier $supplierId"
            
            # Check duplicate link rejection
            $dupResult = Api-Call "POST" "/suppliers/$supplierId/materials" $linkData
            if ($dupResult.statusCode -eq 400 -or $dupResult.statusCode -eq 409) {
                Log-Result "Suppliers" "Duplicate-Link" $true "Got $($dupResult.statusCode) on duplicate"
            } else {
                Log-Result "Suppliers" "Duplicate-Link" $false "Expected 400/409, got $($dupResult.statusCode)"
            }
            
            # Delete the material link
            $delLink = Api-Call "DELETE" "/suppliers/$supplierId/materials/$itemId"
            Log-Result "Suppliers" "Material-Unlink" $delLink.success "Deleted link"
        } else {
            Log-Result "Suppliers" "Material-Link" $false "Failed: $($linkResult.data | ConvertTo-Json)"
        }
    }
    
    # Delete supplier
    $supDelete = Api-Call "DELETE" "/suppliers/$supplierId"
    if ($supDelete.success) {
        $dbCheck = Sql-Query "SELECT is_active FROM suppliers WHERE id=$supplierId"
        Log-Result "Suppliers" "Delete" $true "DB state: $dbCheck"
    } else {
        Log-Result "Suppliers" "Delete" $false "Status: $($supDelete.statusCode)"
    }
} else {
    Log-Result "Suppliers" "Create" $false "Status: $($supCreate.statusCode), Body: $($supCreate.data | ConvertTo-Json)"
}

# ============================================================
# Continue writing more test modules...
# ============================================================
Write-Host "`n============================================"
Write-Host "TEST EXECUTION COMPLETE"
Write-Host "============================================"
Write-Host "`nSUMMARY:"
foreach ($module in $RESULTS.Keys | Sort-Object) {
    $moduleResults = $RESULTS[$module]
    $passed = ($moduleResults.Values | Where-Object { $_.passed }).Count
    $total = $moduleResults.Count
    $status = if ($passed -eq $total) { "PASS" } else { "FAIL" }
    Write-Host "[$status] $module - $passed/$total tests passed"
}
