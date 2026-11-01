# API smoke test: register -> login -> knowledge points -> review -> dashboard -> achievements -> graph -> chat -> AI
# Usage: start backend (node index.js), then run: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/api-smoke.ps1
# Keep this file ASCII-only: Windows PowerShell 5.1 reads scripts as ANSI.
$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000/api'
$stamp = [DateTime]::Now.ToString('MMddHHmmss')
$email = "smoke$stamp@feynman.test"
$pass = 'smoke123456'
$token = $null

function Call($method, $path, $body, $auth) {
    $headers = @{}
    if ($auth) { $headers['Authorization'] = "Bearer $auth" }
    $args = @{ Uri = "$base$path"; Method = $method; Headers = $headers; ContentType = 'application/json' }
    if ($null -ne $body) { $args['Body'] = ($body | ConvertTo-Json -Depth 6 -Compress) }
    try {
        $r = Invoke-WebRequest @args -UseBasicParsing
        $data = $null
        if ($r.Content) { try { $data = $r.Content | ConvertFrom-Json } catch { $data = $r.Content } }
        return [pscustomobject]@{ status = [int]$r.StatusCode; data = $data }
    } catch {
        $resp = $_.Exception.Response
        $code = if ($resp) { [int]$resp.StatusCode } else { 0 }
        $text = ''
        try {
            $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
            $text = $sr.ReadToEnd()
        } catch { $text = $_.Exception.Message }
        return [pscustomobject]@{ status = $code; data = $text }
    }
}

function Report($name, $res, $note) {
    $ok = if ($res.status -ge 200 -and $res.status -lt 300) { 'PASS' } else { 'FAIL' }
    "{0,-4} {1,-34} {2,-4} {3}" -f $ok, $name, $res.status, $note
}

# 1 register
$r = Call POST '/users/register' @{ username = "smoke$stamp"; email = $email; password = $pass } $null
Report 'POST /users/register' $r $r.data.msg
$token = $r.data.token

# 2 login (email + password only)
$r = Call POST '/users/login' @{ email = $email; password = $pass } $null
Report 'POST /users/login' $r $(if ($r.data.token) { 'token ok' } else { $r.data.msg })
if ($r.data.token) { $token = $r.data.token }

# 3 current user
$r = Call GET '/users/me' $null $token
Report 'GET  /users/me' $r ("name=" + $r.data.username + " xp=" + $r.data.xp + " streak=" + $r.data.streak)

# 4 create knowledge point
$body = @{
    title = "smoke kp $stamp"
    content = 'Smoke test content used to verify that the main API endpoints work end to end.'
    category = 'Testing'
    tags = @('smoke', 'auto')
    summary = 'smoke summary'
}
$r = Call POST '/knowledge-points' $body $token
Report 'POST /knowledge-points' $r ("id=" + $r.data._id + " reward=" + $r.data.reward.xp)
$kpId = $r.data._id

# 5 list with search / sort
$r = Call GET '/knowledge-points?search=smoke&sort=recent' $null $token
Report 'GET  /knowledge-points?search' $r ("matched=" + @($r.data).Count)

# 6 facets
$r = Call GET '/knowledge-points/facets' $null $token
Report 'GET  /knowledge-points/facets' $r ("categories=" + @($r.data.categories).Count + " tags=" + @($r.data.tags).Count)

# 7 due queue
$r = Call GET '/knowledge-points/review/due' $null $token
Report 'GET  /knowledge-points/review/due' $r ("due=" + @($r.data).Count)

# 8 review grade
$r = Call POST "/knowledge-points/$kpId/review" @{ grade = 4 } $token
Report 'POST /knowledge-points/:id/review' $r ("mastery=" + $r.data.knowledgePoint.mastery + " interval=" + $r.data.knowledgePoint.review.intervalDays)

# 9 update (whitelist)
$r = Call PUT "/knowledge-points/$kpId" @{ favorite = $true; category = 'Testing2'; tags = @('smoke') } $token
Report 'PUT  /knowledge-points/:id' $r ("favorite=" + $r.data.favorite + " category=" + $r.data.category)

# 10 dashboard overview
$r = Call GET '/dashboard/overview' $null $token
Report 'GET  /dashboard/overview' $r ("level=" + $r.data.level.level + " notes=" + $r.data.counts.total + " due=" + $r.data.counts.due)

# 11 heatmap + weekly report
$r = Call GET '/dashboard/heatmap?weeks=12' $null $token
Report 'GET  /dashboard/heatmap' $r ("days=" + @($r.data.days).Count)
$r = Call GET '/dashboard/weekly-report' $null $token
Report 'GET  /dashboard/weekly-report' $r ("xp=" + $r.data.totals.xp + " weak=" + @($r.data.weakPoints).Count)

# 12 achievements + daily tasks
$r = Call GET '/achievements' $null $token
Report 'GET  /achievements' $r ("unlocked=" + $r.data.unlockedCount + "/" + $r.data.total)
$r = Call GET '/achievements/daily-tasks' $null $token
Report 'GET  /achievements/daily-tasks' $r ("tasks=" + @($r.data.tasks).Count)
$r = Call POST '/achievements/check' $null $token
Report 'POST /achievements/check' $r ("newly=" + @($r.data.unlocked).Count)

# 13 graph
$r = Call GET '/graph/knowledge-map' $null $token
Report 'GET  /graph/knowledge-map' $r ("nodes=" + @($r.data.nodes).Count + " links=" + @($r.data.links).Count)

# 14 chat conversation CRUD
$r = Call POST '/chat/conversations' @{ title = 'smoke conversation' } $token
Report 'POST /chat/conversations' $r ("id=" + $r.data._id)
$convId = $r.data._id
$r = Call GET '/chat/conversations' $null $token
Report 'GET  /chat/conversations' $r ("count=" + @($r.data).Count)
if ($convId) {
    $r = Call PUT "/chat/conversations/$convId" @{ title = 'smoke renamed' } $token
    Report 'PUT  /chat/conversations/:id' $r ("title=" + $r.data.title)
    $r = Call DELETE "/chat/conversations/$convId" $null $token
    Report 'DELETE /chat/conversations/:id' $r ''
}

# 15 flashcards + quiz attempts
$r = Call GET '/flashcards' $null $token
Report 'GET  /flashcards' $r ("cards=" + @($r.data).Count)
$r = Call GET '/quiz-attempts' $null $token
Report 'GET  /quiz-attempts' $r ("attempts=" + @($r.data).Count)

# 16 AI question generation (needs third-party LLM; failure is reported only)
$aiBody = @{ knowledgePointContent = $body.content; difficulty = 'medium'; type = 'single-choice' }
$r = Call POST '/ai/generate-question' $aiBody $token
$note = if ($r.status -ge 200 -and $r.status -lt 300) { 'question=' + [string]$r.data.question } else { ("$($r.data)" -replace '\s+', ' ') }
Report 'POST /ai/generate-question' $r $note

# 17 grade a short answer (same LLM dependency)
$gradeBody = @{ question = 'What is a knowledge point?'; answerKeyPoints = @('a concept', 'an explanation'); studentAnswer = 'A concept you explain in your own words.' }
$r = Call POST '/ai/grade-answer' $gradeBody $token
$note = if ($r.status -ge 200 -and $r.status -lt 300) { 'isCorrect=' + $r.data.isCorrect } else { ("$($r.data)" -replace '\s+', ' ') }
Report 'POST /ai/grade-answer' $r $note

# 18 cleanup
if ($kpId) {
    $r = Call DELETE "/knowledge-points/$kpId" $null $token
    Report 'DELETE /knowledge-points/:id' $r ''
}
"---- smoke user: $email"
