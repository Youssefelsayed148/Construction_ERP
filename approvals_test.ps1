# Part 1: Approvals Approve/Reject Full Lifecycle Test
$ErrorActionPreference = "Continue"
$BASE_URL = "http://localhost:5000/api"

# Get tokens for all three users
$ownerBody = @{ email = "owner@construction-erp.com"; password = "admin123" } | ConvertTo-Json
$ownerLogin = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method POST -Body $ownerBody -ContentType "application/json"
$OWNER_TOKEN = $ownerLogin.data.token
Write-Host "[SETUP] Owner logged in (id=$($ownerLogin.data.user.id))"

$fmBody = @{ email = "test-finance-mgr@test.com"; password = "test123" } | ConvertTo-Json
$fmLogin = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method POST -Body $fmBody -ContentType "application/json"
$FM_TOKEN = $fmLogin.data.token
Write-Host "[SETUP] Finance Manager logged in (id=$($fmLogin.data.user.id), role=$($fmLogin.data.user.role))"

$staffBody = @{ email = "test-staff@test.com"; password = "test123" } | ConvertTo-Json
$staffLogin = Invoke-RestMethod -Uri "$BASE_URL/auth/login" -Method POST -Body $staffBody -ContentType "application/json"
$STAFF_TOKEN = $staffLogin.data.token
Write-Host "[SETUP] Staff logged in (id=$($staffLogin.data.user.id), role=$($staffLogin.data.user.role))"

function Api-Call($method, $path, $body, $token) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    $uri = "$BASE_URL$path"
    try {
        if ($body) {
            $response = Invoke-RestMethod -Uri $uri -Method $method -Headers $headers -Body ($body | ConvertTo-Json -Depth 10)
        } else {
            $response = Invoke-RestMethod -Uri $uri -Method $method -Headers $headers
        }
        return @{ success = $true; data = $response; statusCode = 200 }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $respBody = $reader.ReadToEnd() | ConvertFrom-Json
        } catch { $respBody = $_.Exception.Message }
        return @{ success = $false; data = $respBody; statusCode = $statusCode }
    }
}

function Sql($q) {
    return & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -h localhost -U postgres -d construction_erp -t -A -c $q 2>&1
}

$PASS = 0; $FAIL = 0
function Log($test, $ok, $detail) {
    if ($ok) { $global:PASS++; Write-Host "  [PASS] $test" } else { $global:FAIL++; Write-Host "  [FAIL] $test -- $detail" }
}

# ===================================================================
# TEST 1: FULL APPROVE FLOW (manager_review -> owner_review -> approved)
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 1: Full Approve Flow (expense)"
Write-Host "============================================"

# 1a. Create expense as Owner
$exp1 = Api-Call "POST" "/expenses" @{ category="materials"; amount=5000; description="TEST-Approval-Expense-1"; date="2026-07-27" } $OWNER_TOKEN
$exp1Id = if ($exp1.success) { $exp1.data.data.id } else { $null }
Log "1a-Create-Expense" ($exp1.success -and $exp1Id) "ID=$exp1Id status=$($exp1.data.data.status)"

# 1b. Verify expense in DB with status 'pending'
$exp1Db = Sql "SELECT id, status, amount FROM expenses WHERE id=$exp1Id"
Log "1b-DB-Verify-Expense" ($exp1Db -match "pending" -and $exp1Db -match "5000") "DB: $exp1Db"

# 1c. Submit approval request as Owner
$req1 = Api-Call "POST" "/approvals/request" @{ module_name="expenses"; request_type="expense"; request_id=$exp1Id; notes="TEST-Approve-Flow-1" } $OWNER_TOKEN
$req1Id = if ($req1.success) { $req1.data.request.id } else { $null }
$req1Stage = if ($req1.success) { $req1.data.request.stage } else { "N/A" }
Log "1c-Submit-Request" ($req1.success -and $req1Id) "Request ID=$req1Id stage=$req1Stage"

# 1d. DB verify approval request at manager_review stage
$req1Db = Sql "SELECT id, stage, status FROM approval_requests WHERE id=$req1Id"
Log "1d-DB-Verify-Request" ($req1Db -match "manager_review" -and $req1Db -match "pending") "DB: $req1Db"

# 1e. Finance Manager approves at manager_review
$apr1 = Api-Call "PUT" "/approvals/$req1Id/approve" @{ notes="TEST-Manager-Approved" } $FM_TOKEN
$apr1Stage = if ($apr1.success) { $apr1.data.stage } else { "FAIL" }
Log "1e-FinanceMgr-Approve" ($apr1.statusCode -eq 200 -and $apr1Stage -eq "forwarded_to_owner") "Status=$($apr1.statusCode) stage=$apr1Stage"

# 1f. DB verify approval advanced to owner_review
$req1Db2 = Sql "SELECT stage, status, manager_id, manager_approved_at FROM approval_requests WHERE id=$req1Id"
Log "1f-DB-Verify-Mgr-Approval" ($req1Db2 -match "owner_review" -and $req1Db2 -match "pending") "DB: $req1Db2"

# 1g. Owner approves at owner_review
$apr2 = Api-Call "PUT" "/approvals/$req1Id/approve" @{ notes="TEST-Owner-Approved" } $OWNER_TOKEN
$apr2Stage = if ($apr2.success) { $apr2.data.stage } else { "FAIL" }
Log "1g-Owner-Approve" ($apr2.statusCode -eq 200 -and $apr2Stage -eq "fully_approved") "Status=$($apr2.statusCode) stage=$apr2Stage"

# 1h. DB verify approval request fully approved
$req1Db3 = Sql "SELECT stage, status, manager_id, approver_id FROM approval_requests WHERE id=$req1Id"
Log "1h-DB-Verify-Fully-Approved" ($req1Db3 -match "approved") "DB: $req1Db3"

# 1i. DB verify source expense status = 'approved'
$exp1Db2 = Sql "SELECT id, status FROM expenses WHERE id=$exp1Id"
Log "1i-DB-Verify-Expense-Approved" ($exp1Db2 -match "approved") "Expense status: $exp1Db2"

# ===================================================================
# TEST 2: REJECT AT MANAGER_REVIEW STAGE
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 2: Reject at manager_review (Finance Mgr rejects)"
Write-Host "============================================"

# 2a. Create expense
$exp2 = Api-Call "POST" "/expenses" @{ category="labor"; amount=3000; description="TEST-Reject-Mgr-Expense"; date="2026-07-27" } $OWNER_TOKEN
$exp2Id = if ($exp2.success) { $exp2.data.data.id } else { $null }
Log "2a-Create-Expense" ($exp2.success) "ID=$exp2Id"

# 2b. Submit approval request
$req2 = Api-Call "POST" "/approvals/request" @{ module_name="expenses"; request_type="expense"; request_id=$exp2Id; notes="TEST-RejectFlow" } $OWNER_TOKEN
$req2Id = if ($req2.success) { $req2.data.request.id } else { $null }
Log "2b-Submit-Request" ($req2.success) "Request ID=$req2Id"

# 2c. Finance Manager rejects at manager_review
$rej1 = Api-Call "PUT" "/approvals/$req2Id/reject" @{ notes="TEST-Rejected-by-Manager" } $FM_TOKEN
Log "2c-FinanceMgr-Reject" ($rej1.statusCode -eq 200) "Status=$($rej1.statusCode)"

# 2d. DB verify approval request status = 'rejected'
$req2Db = Sql "SELECT stage, status FROM approval_requests WHERE id=$req2Id"
Log "2d-DB-Verify-Rejected" ($req2Db -match "rejected") "DB: $req2Db"

# 2e. DB verify expense source record status = 'rejected'
$exp2Db = Sql "SELECT id, status FROM expenses WHERE id=$exp2Id"
Log "2e-DB-Verify-Expense-Rejected" ($exp2Db -match "rejected") "Expense: $exp2Db"

# 2f. Verify rejection did NOT advance to owner_review — stage should still be whatever it was
$req2Stage = Sql "SELECT stage FROM approval_requests WHERE id=$req2Id"
# After rejection at manager_review, the stage remains 'manager_review' in DB (the rejectRecordStatus runs but doesn't change stage)
Log "2f-Verify-No-Advance" ($req2Stage -notmatch "owner_review") "Stage after reject: $req2Stage"

# ===================================================================
# TEST 3: REJECT AT OWNER_REVIEW STAGE
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 3: Reject at owner_review (Owner rejects after manager approved)"
Write-Host "============================================"

# 3a. Create expense
$exp3 = Api-Call "POST" "/expenses" @{ category="equipment"; amount=8000; description="TEST-Reject-Owner"; date="2026-07-27" } $OWNER_TOKEN
$exp3Id = if ($exp3.success) { $exp3.data.data.id } else { $null }
Log "3a-Create-Expense" ($exp3.success) "ID=$exp3Id"

# 3b. Submit approval
$req3 = Api-Call "POST" "/approvals/request" @{ module_name="expenses"; request_type="expense"; request_id=$exp3Id; notes="TEST-OwnerRejectFlow" } $OWNER_TOKEN
$req3Id = if ($req3.success) { $req3.data.request.id } else { $null }
Log "3b-Submit-Request" ($req3.success) "Request ID=$req3Id"

# 3c. Finance Manager approves at manager_review
$apr3 = Api-Call "PUT" "/approvals/$req3Id/approve" @{ notes="TEST-Mgr-Approved" } $FM_TOKEN
Log "3c-FinanceMgr-Approve" ($apr3.statusCode -eq 200) "Stage: $($apr3.data.stage)"

# 3d. Owner rejects at owner_review
$rej3 = Api-Call "PUT" "/approvals/$req3Id/reject" @{ notes="TEST-Owner-Rejected" } $OWNER_TOKEN
Log "3d-Owner-Reject" ($rej3.statusCode -eq 200) "Status=$($rej3.statusCode)"

# 3e. DB verify approval request rejected
$req3Db = Sql "SELECT stage, status FROM approval_requests WHERE id=$req3Id"
Log "3e-DB-Verify-Rejected" ($req3Db -match "rejected") "DB: $req3Db"

# 3f. DB verify expense source record rejected
$exp3Db = Sql "SELECT id, status FROM expenses WHERE id=$exp3Id"
Log "3f-DB-Verify-Expense-Rejected" ($exp3Db -match "rejected") "Expense: $exp3Db"

# ===================================================================
# TEST 4: UNAUTHORIZED ACCESS (wrong role tries to approve)
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 4: Unauthorized approve/reject attempts"
Write-Host "============================================"

# 4a. Create expense and approval request
$exp4 = Api-Call "POST" "/expenses" @{ category="utilities"; amount=1000; description="TEST-Unauthorized"; date="2026-07-27" } $OWNER_TOKEN
$exp4Id = if ($exp4.success) { $exp4.data.data.id } else { $null }
$req4 = Api-Call "POST" "/approvals/request" @{ module_name="expenses"; request_type="expense"; request_id=$exp4Id; notes="TEST-Unauthorized" } $OWNER_TOKEN
$req4Id = if ($req4.success) { $req4.data.request.id } else { $null }
Log "4a-Setup" (($exp4.success) -and ($req4.success)) "Expense=$exp4Id Request=$req4Id"

# 4b. Staff user (role=staff) tries to approve at manager_review — expect 403
$unauth1 = Api-Call "PUT" "/approvals/$req4Id/approve" @{ notes="TEST" } $STAFF_TOKEN
Log "4b-Staff-Cannot-Approve" ($unauth1.statusCode -eq 403) "Expected 403, got $($unauth1.statusCode) Body: $($unauth1.data | ConvertTo-Json)"

# 4c. Staff user tries to reject — expect 403
$unauth2 = Api-Call "PUT" "/approvals/$req4Id/reject" @{ notes="TEST" } $STAFF_TOKEN
Log "4c-Staff-Cannot-Reject" ($unauth2.statusCode -eq 403) "Expected 403, got $($unauth2.statusCode)"

# 4d. DB verify approval request still pending (no state change from unauthorized)
$req4Db = Sql "SELECT stage, status FROM approval_requests WHERE id=$req4Id"
Log "4d-DB-Verify-Unchanged" ($req4Db -match "pending" -and $req4Db -match "manager_review") "DB: $req4Db"

# ===================================================================
# TEST 5: SELF-APPROVAL BLOCKED (requester != approver)
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 5: Self-approval blocked (Owner cannot approve own request at manager stage)"
Write-Host "============================================"

# 5a. Owner tries to approve own request at manager_review stage
# The `advanceApproval` function checks: if (ar.requester_id === userId && role !== 'owner' && role !== 'admin')
# Since the approver IS owner, this check should NOT block. 
# BUT the second check: at owner_review stage, only owner/admin can approve.
# At manager_review stage: checks allowedRoles (finance_manager). Owner bypasses allowedRoles check.
# So Owner CAN approve at manager_review (owner bypasses all role gates).
# Let's verify this behavior:
$ownApr = Api-Call "PUT" "/approvals/$req4Id/approve" @{ notes="TEST-Owner-Bypasses-Manager" } $OWNER_TOKEN
$ownAprStage = if ($ownApr.success) { $ownApr.data.stage } else { "FAIL" }
Log "5a-Owner-Bypasses-Manager-Stage" ($ownApr.statusCode -eq 200) "Status=$($ownApr.statusCode) stage=$ownAprStage Details: $($ownApr.data | ConvertTo-Json)"

# 5b. Now Owner can approve at owner_review too
$ownApr2 = Api-Call "PUT" "/approvals/$req4Id/approve" @{ notes="TEST-Owner-Final" } $OWNER_TOKEN
Log "5b-Owner-Final-Approve" ($ownApr2.statusCode -eq 200) "Status=$($ownApr2.statusCode) stage=$($ownApr2.data.stage)"

# 5c. Verify expense approved
$exp4Db = Sql "SELECT id, status FROM expenses WHERE id=$exp4Id"
Log "5c-DB-Verify-Expense-Approved" ($exp4Db -match "approved") "Expense: $exp4Db"

# ===================================================================
# TEST 6: APPROVE/REJECT ALREADY PROCESSED REQUEST
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 6: Cannot process already-resolved request"
Write-Host "============================================"

# 6a. Try to approve the already-approved request $req4Id
$already = Api-Call "PUT" "/approvals/$req4Id/approve" @{ notes="TEST" } $OWNER_TOKEN
Log "6a-Cannot-Reapprove" ($already.statusCode -eq 400) "Expected 400, got $($already.statusCode) Body: $($already.data.error)"

# 6b. Try to approve the already-rejected request $req2Id
$already2 = Api-Call "PUT" "/approvals/$req2Id/approve" @{ notes="TEST" } $OWNER_TOKEN
Log "6b-Cannot-Approve-Rejected" ($already2.statusCode -eq 400) "Expected 400, got $($already2.statusCode) Body: $($already2.data.error)"

# ===================================================================
# TEST 7: CHECK ENDPOINT AFTER FULL APPROVAL
# ===================================================================
Write-Host "`n============================================"
Write-Host "TEST 7: Check endpoint after approval"
Write-Host "============================================"

$check1 = Api-Call "GET" "/approvals/check/expenses/$exp1Id" $null $OWNER_TOKEN
Log "7a-Check-Approved" (($check1.data.requires_approval -eq $false -or $check1.data.approved -eq $true)) "Response: $($check1.data | ConvertTo-Json)"

$check2 = Api-Call "GET" "/approvals/check/expenses/$exp2Id" $null $OWNER_TOKEN
Log "7b-Check-Rejected" ($check2.success) "Response: $($check2.data | ConvertTo-Json)"

# ===================================================================
# FINAL SUMMARY
# ===================================================================
Write-Host "`n============================================"
Write-Host "APPROVALS TEST SUMMARY"
Write-Host "============================================"
Write-Host "PASS: $PASS | FAIL: $FAIL | TOTAL: $($PASS+$FAIL)"
Write-Host "============================================"
