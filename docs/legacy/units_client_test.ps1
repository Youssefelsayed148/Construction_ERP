# Part 2: Units-Client FK + Invoice Auto-Creation Verification
$ErrorActionPreference = "Continue"
$BASE_URL = "http://localhost:5000/api"

# Login
$ownerBody = @{ email = "owner@construction-erp.com"; password = "admin123" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method POST -Body $ownerBody -ContentType "application/json"
$TOKEN = $login.data.token
Write-Host "[SETUP] Owner logged in"

function Api($method, $path, $body) {
    $headers = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $TOKEN" }
    $uri = "$BASE_URL$path"
    try {
        $r = if ($body) { Invoke-RestMethod -Uri $uri -Method $method -Headers $headers -Body ($body | ConvertTo-Json -Depth 10) }
              else { Invoke-RestMethod -Uri $uri -Method $method -Headers $headers }
        return @{ success = $true; data = $r; statusCode = 200 }
    } catch {
        $sc = $_.Exception.Response.StatusCode.value__
        try { $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream()); $rb = $reader.ReadToEnd() | ConvertFrom-Json }
        catch { $rb = $_.Exception.Message }
        return @{ success = $false; data = $rb; statusCode = $sc }
    }
}

function Sql($q) { return & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d construction_erp -t -A -c $q 2>&1 }

$PASS = 0; $FAIL = 0
function L($t, $ok, $d) { if ($ok) { $global:PASS++; Write-Host "  [PASS] $t" } else { $global:FAIL++; Write-Host "  [FAIL] $t -- $d" } }

# ===================================================================
# SETUP: Get fresh project + client
# ===================================================================
Write-Host "`n============================================"
Write-Host "SETUP: Creating project, building, unit, and client"
Write-Host "============================================"

# Get or create a client
$clients = Api "GET" "/clients?limit=1" $null
$clientId = if ($clients.success) { $clients.data.data[0].id } else { $null }
if (-not $clientId) {
    $nc = Api "POST" "/clients" @{ name_ar = "TEST-Units-Client"; name_en = "TEST Units Client"; city = "Dubai"; client_type = "individual" }
    $clientId = if ($nc.success) { $nc.data.data.id } else { $null }
}
L "Setup-Client" ($clientId -ne $null) "Client ID=$clientId"

# Create project
$proj = Api "POST" "/projects" @{ name_ar = "TEST-Units-Project AR"; name_en = "TEST-Units-Project EN"; client_id = $clientId; project_type = "residential"; contract_value = 10000000 }
$projectId = if ($proj.success) { $proj.data.data.id } else { $null }
L "Setup-Project" ($projectId -ne $null) "Project ID=$projectId"

# Create building
$bld = Api "POST" "/sales/buildings" @{ project_id = $projectId; code = "TEST-BLD-001"; name = "TEST-Tower-1"; floors = 5; units_per_floor = 4 }
$buildingId = if ($bld.success) { $bld.data.data.id } else { $null }
L "Setup-Building" ($buildingId -ne $null) "Building ID=$buildingId"

# Create unit with a price
$unit = Api "POST" "/sales/buildings/$buildingId/units" @{ code = "TEST-101"; type = "apartment"; area = 120.5; bedrooms = 2; bathrooms = 2; floor_no = 1; finishing_type = "finished"; price = 850000 }
$unitId = if ($unit.success) { $unit.data.data.id } else { $null }
$unitPrice = if ($unit.success) { $unit.data.data.price } else { 0 }
L "Setup-Unit" ($unitId -ne $null) "Unit ID=$unitId price=$unitPrice"

# ===================================================================
# TEST 1: Verify DB has client_id column with FK
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 1: FK column exists in DB"
Write-Host "============================================"

$colCheck = Sql "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='units' AND column_name='client_id'"
L "1a-Column-Exists" ($colCheck -match "client_id") "DB: $colCheck"

$fkCheck = Sql "SELECT conname FROM pg_constraint WHERE conname LIKE '%unit%client%' OR (conrelid='units'::regclass AND contype='f' AND conkey @> ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='units'::regclass AND attname='client_id')])"
L "1b-FK-Exists" ($fkCheck.Trim().Length -gt 0) "FK: $fkCheck"

# ===================================================================
# TEST 2: Transition unit to reserved WITH client_id
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 2: Reserve unit with client_id"
Write-Host "============================================"

$res = Api "POST" "/sales/units/$unitId/status" @{ status = "reserved"; client_id = $clientId }
L "2a-Reserve-Unit" ($res.success) "Status=$($res.statusCode)"

$dbUnit = Sql "SELECT status, client_id FROM units WHERE id=$unitId"
L "2b-DB-Verify-Reserved" ($dbUnit -match "reserved" -and $dbUnit -match "$clientId") "DB: $dbUnit"

# ===================================================================
# TEST 3: Require client_id when contracting without it
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 3: Require client_id for reserved/contracted"
Write-Host "============================================"

# Create a fresh unit that doesn't have client_id yet
$unit2 = Api "POST" "/sales/buildings/$buildingId/units" @{ code = "TEST-102"; type = "apartment"; area = 100; bedrooms = 1; bathrooms = 1; floor_no = 1; price = 650000 }
$unit2Id = if ($unit2.success) { $unit2.data.data.id } else { $null }
L "3a-Create-Unit2" ($unit2Id -ne $null) "Unit2 ID=$unit2Id"

# Try to reserve without client_id
$badRes = Api "POST" "/sales/units/$unit2Id/status" @{ status = "reserved" }
L "3b-Reject-No-Client" ($badRes.statusCode -eq 400) "Expected 400, got $($badRes.statusCode): $($badRes.data.error)"

# ===================================================================
# TEST 4: Full sale flow with invoice auto-creation
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 4: Contract unit -> auto-create invoice"
Write-Host "============================================"

# Reserve unit2 with client
$res2 = Api "POST" "/sales/units/$unit2Id/status" @{ status = "reserved"; client_id = $clientId }
L "4a-Reserve-Unit2" ($res2.success) "Status=$($res2.statusCode)"

# Contract unit2 with sold_amount (this should auto-create invoice)
$contract = Api "POST" "/sales/units/$unit2Id/status" @{ status = "contracted"; client_id = $clientId; sold_amount = 650000 }
L "4b-Contract-Unit2" ($contract.success) "Status=$($contract.statusCode)"

# Check DB for unit state
$dbUnit2 = Sql "SELECT status, client_id, sold_amount FROM units WHERE id=$unit2Id"
L "4c-DB-Verify-Contracted" ($dbUnit2 -match "contracted" -and $dbUnit2 -match "$clientId" -and $dbUnit2 -match "650000") "DB: $dbUnit2"

# Check if invoice was auto-created
$invCheck = Sql "SELECT id, invoice_number, amount, client_id, project_id, status FROM invoices WHERE description LIKE '%TEST-102%' ORDER BY id DESC LIMIT 1"
L "4d-AutoInvoice-Exists" ($invCheck -match "650000") "Invoice: $invCheck"

# Get the invoice ID
$invLines = $invCheck -split '\|'
$autoInvId = $invLines[0].Trim()
$autoInvAmount = $invLines[2].Trim()
L "4e-Invoice-Amount-Matches" ($autoInvAmount -eq "650000.00" -or $autoInvAmount -eq "650000") "Amount: $autoInvAmount (expected 650000)"

# ===================================================================
# TEST 5: Invoice appears in finance/project endpoint
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 5: Finance cross-check for unit sale invoice"
Write-Host "============================================"

$finProj = Api "GET" "/finance/project/$projectId" $null
if ($finProj.success) {
    $fdata = if ($finProj.data.data) { $finProj.data.data } else { $finProj.data }
    L "5a-Finance-Project" $true "total_invoiced=$($fdata.total_invoiced) total_paid=$($fdata.total_paid)"
    
    # Manually compute
    $invSum = Sql "SELECT COALESCE(SUM(amount),0) FROM invoices WHERE project_id=$projectId"
    $paySum = Sql "SELECT COALESCE(SUM(amount),0) FROM payments WHERE project_id=$projectId"
    L "5b-Finance-Matches-Invoices" ($fdata.total_invoiced -eq [double]($invSum.Trim())) "API: $($fdata.total_invoiced) SQL: $($invSum.Trim())"
}

# ===================================================================
# TEST 6: Client delete blocked with contracted unit
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 6: Delete-with-dependencies (client with unit)"
Write-Host "============================================"

$delClient = Api "DELETE" "/clients/$clientId" $null
# ON DELETE RESTRICT should block deletion
L "6a-Delete-Blocked" ($delClient.statusCode -eq 500 -or $delClient.statusCode -eq 400) "Expected FK restriction error, got $($delClient.statusCode): $($delClient.data.error)"

# Verify client still exists
$clientStill = Sql "SELECT id, is_active FROM clients WHERE id=$clientId"
L "6b-Client-Still-Exists" ($clientStill -match "$clientId") "DB: $clientStill"

# Release the unit back to available (contracted -> reserved -> available)
$release1 = Api "POST" "/sales/units/$unit2Id/status" @{ status = "reserved" }
L "6c-Release-Step1" ($release1.success) "Contracted->reserved: $($release1.statusCode)"

$release2 = Api "POST" "/sales/units/$unit2Id/status" @{ status = "available" }
L "6c-Release-Step2" ($release2.success) "Reserved->available: $($release2.statusCode)"

$dbRelease = Sql "SELECT status, client_id FROM units WHERE id=$unit2Id"
L "6d-DB-Verify-Released" ($dbRelease -match "available" -and $dbRelease -notmatch "$clientId") "DB: $dbRelease"

# ===================================================================
# TEST 7: Sales summary includes client breakdown
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 7: Sales summary with client info"
Write-Host "============================================"

$summary = Api "GET" "/sales/summary?project_id=$projectId" $null
if ($summary.success) {
    $sdata = if ($summary.data.data) { $summary.data.data } else { $summary.data }
    L "7a-Summary-Returns" $true "total_units=$($sdata.total_units)"

    # Check if client_breakdown exists in response (might be empty if no contracted units)
    if ($sdata.PSObject.Properties.Name -contains "client_breakdown") {
        $cb = $sdata.client_breakdown
        L "7b-Client-Breakdown" $true "Breakdown exists, entries: $(if($cb){$cb.Count}else{0})"
    } else {
        L "7b-Client-Breakdown" $false "client_breakdown key not found in response"
    }
}

# ===================================================================
# TEST 8: Verify the full flow end-to-end
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 8: End-to-end flow with fresh unit"
Write-Host "============================================"

# Create another unit
$unit3 = Api "POST" "/sales/buildings/$buildingId/units" @{ code = "TEST-103"; type = "villa"; area = 200; bedrooms = 3; bathrooms = 3; floor_no = 2; price = 1500000 }
$unit3Id = if ($unit3.success) { $unit3.data.data.id } else { $null }
L "8a-Create-Unit3" ($unit3Id -ne $null) "Unit3 ID=$unit3Id"

# Reserve with client
$res3 = Api "POST" "/sales/units/$unit3Id/status" @{ status = "reserved"; client_id = $clientId }
L "8b-Reserve-Unit3" ($res3.success) "OK"

# Get another client for diversity
$client2Res = Api "POST" "/clients" @{ name_ar = "TEST-Client-2-AR"; name_en = "TEST-Client-2 EN"; city = "Abu Dhabi"; client_type = "commercial" }
$client2Id = if ($client2Res.success) { $client2Res.data.data.id } else { $null }

# Contract unit1 (the original) with the second client
$contract1 = Api "POST" "/sales/units/$unitId/status" @{ status = "contracted"; client_id = $client2Id; sold_amount = 850000 }
L "8c-Contract-Unit1" ($contract1.success) "OK"

# Check both units in DB
$unit1Db = Sql "SELECT status, client_id, sold_amount FROM units WHERE id=$unitId"
$unit3Db = Sql "SELECT status, client_id, sold_amount FROM units WHERE id=$unit3Id"
L "8d-Both-Units-Correct" ($unit1Db -match "contracted" -and $unit3Db -match "reserved") "U1: $unit1Db | U3: $unit3Db"

# Check invoices table for auto-created ones
$allInvs = Sql "SELECT COUNT(*) FROM invoices WHERE project_id=$projectId AND description LIKE 'Auto-generated%'"
L "8e-Auto-Invoice-Count" ([int]$allInvs -ge 1) "Auto-invoices: $allInvs"

# ===================================================================
# FINAL SUMMARY
# ===================================================================
Write-Host "`n============================================"
Write-Host "PART 2 SUMMARY"
Write-Host "============================================"
Write-Host "PASS: $PASS | FAIL: $FAIL | TOTAL: $($PASS+$FAIL)"
Write-Host "============================================"
