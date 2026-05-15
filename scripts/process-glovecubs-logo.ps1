param(
    [string]$Source = "c:\dev\Glovecubs\storefront\public\images\glovecubs-header-logo.png",
    [string]$Dest   = "c:\dev\Glovecubs\storefront\public\images\glovecubs-header-logo.png",
    [string]$FooterMaskDest = "c:\dev\Glovecubs\storefront\public\images\glovecubs-footer-logo-mask.png",
    [int]$Threshold = 40,
    [int]$MinComponent = 25
)

# Rebuild header logo:
# 1) Edge-flood dark pixels -> "outside" background; paint those white.
# 2) Other enclosed dark regions (e.g. counters in "B") are not edge-connected; paint
#    those white too, except the leftmost significant dark blob (the paw in "O").

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Source)) {
    Write-Error "Source not found: $Source"; exit 1
}

function Test-IsDark([int]$r, [int]$g, [int]$b, [int]$T) {
    return ($r -le $T -and $g -le $T -and $b -le $T)
}

# Avoid GDI+ file lock when Source and Dest are the same path.
$srcBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Source))
$memIn = New-Object System.IO.MemoryStream(,$srcBytes)
$src = [System.Drawing.Bitmap]::FromStream($memIn)

$w = $src.Width; $h = $src.Height
Write-Host "Source: ${w}x${h}"

$rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
$data = $src.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$stride = $data.Stride
$bytes = New-Object byte[] ($stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length) | Out-Null

function Get-Rgb([int]$x, [int]$y) {
    $row = $y * $stride
    $i = $row + ($x * 4)
    return @{
        I = $i
        B = [int]$bytes[$i]
        G = [int]$bytes[$i + 1]
        R = [int]$bytes[$i + 2]
    }
}

$N = $w * $h
$bg = New-Object bool[] $N
$q = New-Object System.Collections.Queue

function Enqueue-IfDark([int]$x, [int]$y) {
    if ($x -lt 0 -or $x -ge $w -or $y -lt 0 -or $y -ge $h) { return }
    $ix = $y * $w + $x
    if ($bg[$ix]) { return }
    $p = Get-Rgb $x $y
    if (-not (Test-IsDark $p.R $p.G $p.B $Threshold)) { return }
    $bg[$ix] = $true
    [void]$q.Enqueue(@($x, $y))
}

for ($x = 0; $x -lt $w; $x++) {
    Enqueue-IfDark $x 0
    Enqueue-IfDark $x ($h - 1)
}
for ($y = 0; $y -lt $h; $y++) {
    Enqueue-IfDark 0 $y
    Enqueue-IfDark ($w - 1) $y
}

while ($q.Count -gt 0) {
    $cur = $q.Dequeue()
    $cx = $cur[0]; $cy = $cur[1]
    foreach ($d in @(@(1,0),@(-1,0),@(0,1),@(0,-1))) {
        $nx = $cx + $d[0]; $ny = $cy + $d[1]
        if ($nx -lt 0 -or $nx -ge $w -or $ny -lt 0 -or $ny -ge $h) { continue }
        $nix = $ny * $w + $nx
        if ($bg[$nix]) { continue }
        $p = Get-Rgb $nx $ny
        if (-not (Test-IsDark $p.R $p.G $p.B $Threshold)) { continue }
        $bg[$nix] = $true
        [void]$q.Enqueue(@($nx, $ny))
    }
}

$bgCount = ($bg | Where-Object { $_ }).Count
Write-Host "Edge-connected dark pixels (background -> white): $bgCount"

for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
        $ix = $y * $w + $x
        if (-not $bg[$ix]) { continue }
        $i = $row + ($x * 4)
        $bytes[$i]     = 255
        $bytes[$i + 1] = 255
        $bytes[$i + 2] = 255
        $bytes[$i + 3] = 255
    }
}

function Set-WhiteAt([int]$x, [int]$y) {
    $row = $y * $script:stride
    $i = $row + ($x * 4)
    $script:bytes[$i]     = 255
    $script:bytes[$i + 1] = 255
    $script:bytes[$i + 2] = 255
    $script:bytes[$i + 3] = 255
}

# Enclosed dark regions (not in edge-flood bg): keep only the leftmost "large" blob (paw).
$vis = New-Object bool[] $N
$components = New-Object System.Collections.ArrayList
$nextCompId = 0
for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
        $ix = $y * $w + $x
        if ($bg[$ix] -or $vis[$ix]) { continue }
        $p = Get-Rgb $x $y
        if (-not (Test-IsDark $p.R $p.G $p.B $Threshold)) { continue }
        $q2 = New-Object System.Collections.Queue
        [void]$q2.Enqueue(@($x, $y))
        $vis[$ix] = $true
        $list = New-Object System.Collections.ArrayList
        $cMinX = $w
        while ($q2.Count -gt 0) {
            $cur = $q2.Dequeue()
            $cx = $cur[0]; $cy = $cur[1]
            [void]$list.Add(@($cx, $cy))
            if ($cx -lt $cMinX) { $cMinX = $cx }
            foreach ($d in @(@(1,0),@(-1,0),@(0,1),@(0,-1))) {
                $nx = $cx + $d[0]; $ny = $cy + $d[1]
                if ($nx -lt 0 -or $nx -ge $w -or $ny -lt 0 -or $ny -ge $h) { continue }
                $nix = $ny * $w + $nx
                if ($bg[$nix] -or $vis[$nix]) { continue }
                $pn = Get-Rgb $nx $ny
                if (-not (Test-IsDark $pn.R $pn.G $pn.B $Threshold)) { continue }
                $vis[$nix] = $true
                [void]$q2.Enqueue(@($nx, $ny))
            }
        }
        [void]$components.Add([PSCustomObject]@{
            Id     = $script:nextCompId
            Area   = $list.Count
            MinX   = $cMinX
            Pixels = $list
        })
        $script:nextCompId++
    }
}

$noise = 0
$killed = 0
foreach ($c in $components) {
    if ($c.Area -lt $MinComponent) {
        foreach ($pt in $c.Pixels) { Set-WhiteAt $pt[0] $pt[1]; $noise++ }
    }
}

$sig = @($components | Where-Object { $_.Area -ge $MinComponent })
if ($sig.Count -gt 0) {
    # The paw sits under the "O" (left half of the mark). Do not use global MinX — a stroke
    # artifact or another letter can be farther left. Prefer the largest enclosed dark blob
    # whose centroid sits left of ~43% of image width.
    $cut = [int]([Math]::Floor($w * 0.43))
    $scored = foreach ($c in $sig) {
        $sx = 0
        foreach ($pt in $c.Pixels) { $sx += $pt[0] }
        $centX = $sx / $c.Area
        [PSCustomObject]@{ Comp = $c; CentX = $centX }
    }
    $inO = @($scored | Where-Object { $_.CentX -lt $cut })
    if ($inO.Count -gt 0) {
        $paw = ($inO | Sort-Object { $_.Comp.Area } -Descending | Select-Object -First 1).Comp
        $pawCent = ($scored | Where-Object { $_.Comp.Id -eq $paw.Id }).CentX
        Write-Host "Dark components (>=$MinComponent px): $($sig.Count); keeping paw by left-band+largest (id=$($paw.Id) area=$($paw.Area) centX~$([math]::Round($pawCent, 1)))"
    } else {
        $paw = $sig | Sort-Object MinX, Area | Select-Object -First 1
        Write-Host "Dark components (>=$MinComponent px): $($sig.Count); fallback leftmost-min (id=$($paw.Id))"
    }
    foreach ($c in $sig) {
        if ($c.Id -eq $paw.Id) { continue }
        foreach ($pt in $c.Pixels) { Set-WhiteAt $pt[0] $pt[1]; $killed++ }
    }
} else {
    Write-Host "No enclosed dark components >= $MinComponent px (paw may rely on edge flood only)."
}
Write-Host "Whitened small noise pixels: $noise; other enclosed dark pixels: $killed"

$minX = $w; $minY = $h; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $h; $y++) {
    $row = $y * $stride
    for ($x = 0; $x -lt $w; $x++) {
        $i = $row + ($x * 4)
        $b = [int]$bytes[$i]; $g = [int]$bytes[$i + 1]; $r = [int]$bytes[$i + 2]
        if ($r -gt 248 -and $g -gt 248 -and $b -gt 248) { continue }
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length) | Out-Null
$src.UnlockBits($data)

if ($maxX -lt 0) { Write-Error "No content pixels found after processing"; $src.Dispose(); $memIn.Dispose(); exit 2 }

$pad = 4
$cx = [Math]::Max(0, $minX - $pad)
$cy = [Math]::Max(0, $minY - $pad)
$cw = [Math]::Min($w - $cx, ($maxX - $cx + 1 + $pad))
$ch = [Math]::Min($h - $cy, ($maxY - $cy + 1 + $pad))
Write-Host "Content bounds: x=${minX} y=${minY} -> x=${maxX} y=${maxY}"
Write-Host "Crop: x=$cx y=$cy ${cw}x${ch}"

$cropRect = New-Object System.Drawing.Rectangle $cx, $cy, $cw, $ch
$cropped = $src.Clone($cropRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$cropped.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)

# Footer uses luminance masking: near-white pixels must be transparent or the whole
# bounding box reads as opaque. Export a transparent "outside" variant for mask only.
$innerAll = New-Object System.Drawing.Rectangle 0, 0, $cropped.Width, $cropped.Height
$m = $cropped.Clone($innerAll, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$cropped.Dispose()
$mw = $m.Width; $mh = $m.Height
$rectM = New-Object System.Drawing.Rectangle 0, 0, $mw, $mh
$dataM = $m.LockBits($rectM, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$strM = $dataM.Stride
$bufM = New-Object byte[] ($strM * $mh)
[System.Runtime.InteropServices.Marshal]::Copy($dataM.Scan0, $bufM, 0, $bufM.Length) | Out-Null
for ($yy = 0; $yy -lt $mh; $yy++) {
    $rowM = $yy * $strM
    for ($xx = 0; $xx -lt $mw; $xx++) {
        $j = $rowM + ($xx * 4)
        $br = [int]$bufM[$j]; $gr = [int]$bufM[$j + 1]; $rr = [int]$bufM[$j + 2]
        if ($rr -gt 248 -and $gr -gt 248 -and $br -gt 248) {
            $bufM[$j + 3] = 0
        }
    }
}
[System.Runtime.InteropServices.Marshal]::Copy($bufM, 0, $dataM.Scan0, $bufM.Length) | Out-Null
$m.UnlockBits($dataM)
$m.Save($FooterMaskDest, [System.Drawing.Imaging.ImageFormat]::Png)
$m.Dispose()

$src.Dispose()
$memIn.Dispose()

Write-Host "Wrote: $Dest"
Write-Host "Wrote footer mask: $FooterMaskDest"
