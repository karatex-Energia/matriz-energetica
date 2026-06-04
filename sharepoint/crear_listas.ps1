# ═══════════════════════════════════════════════════════════════════════════════
# crear_listas.ps1
# Colortex SA · Matriz Energética Integrada
# Crea todas las listas necesarias en SharePoint Online
#
# REQUISITOS:
#   - PowerShell 5.1 o superior
#   - Módulo PnP.PowerShell instalado
#
# INSTALACIÓN DEL MÓDULO (ejecutar UNA sola vez como administrador):
#   Install-Module PnP.PowerShell -Scope CurrentUser -Force
#
# USO:
#   .\crear_listas.ps1
#
# ═══════════════════════════════════════════════════════════════════════════════

$SiteUrl = "https://karatex.sharepoint.com/sites/MatrizEnergeticaIntegrada"

Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Colortex SA · Crear Listas SharePoint" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Conectar al sitio
Write-Host "► Conectando a SharePoint..." -ForegroundColor Yellow
Connect-PnPOnline -Url $SiteUrl -UseWebLogin
Write-Host "✓ Conectado como: $((Get-PnPContext).Credentials.UserName)" -ForegroundColor Green
Write-Host ""

# ── FUNCIÓN HELPER ──────────────────────────────────────────────────────────────
function New-SPList {
    param($Nombre, $Descripcion)
    Write-Host "► Creando lista: $Nombre..." -ForegroundColor Yellow
    try {
        $existing = Get-PnPList -Identity $Nombre -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "  ⚠ Ya existe — omitiendo creación" -ForegroundColor DarkYellow
            return $existing
        }
        $list = New-PnPList -Title $Nombre -Template GenericList -EnableVersioning
        Write-Host "  ✓ Lista creada" -ForegroundColor Green
        return $list
    } catch {
        Write-Host "  ✗ Error: $_" -ForegroundColor Red
        return $null
    }
}

function New-Col {
    param($Lista, $Nombre, $Tipo, $Requerido = $false, $Opciones = $null)
    try {
        $existing = Get-PnPField -List $Lista -Identity $Nombre -ErrorAction SilentlyContinue
        if ($existing) { return }

        $params = @{
            List         = $Lista
            DisplayName  = $Nombre
            InternalName = $Nombre -replace '[^a-zA-Z0-9]', '_'
            Type         = $Tipo
            Required     = $Requerido
        }
        if ($Opciones -and $Tipo -eq "Choice") {
            $params.Choices = $Opciones
        }
        Add-PnPField @params | Out-Null
    } catch {
        Write-Host "    ⚠ Columna $Nombre : $_" -ForegroundColor DarkYellow
    }
}

# ══════════════════════════════════════════════════════════════════════════════
# 1. GN_Produccion
#    Registros diarios de producción por equipo (gas natural)
# ══════════════════════════════════════════════════════════════════════════════
Write-Host "[ 1/8 ] GN_Produccion" -ForegroundColor Cyan
New-SPList "GN_Produccion" "Producción diaria por equipo - Gas Natural"
New-Col "GN_Produccion" "Fecha"        "DateTime"  $true
New-Col "GN_Produccion" "Equipo"       "Text"       $true
New-Col "GN_Produccion" "Sector"       "Choice"     $true @("TINTORERIA","ENCOLADO","ESTAMPADO","SALA CALDERA")
New-Col "GN_Produccion" "TipoConsumo"  "Choice"     $false @("DIRECTO","INDIRECTO","MIXTO")
New-Col "GN_Produccion" "Clasificacion" "Choice"    $true @("PROYECTADA","REAL")
New-Col "GN_Produccion" "CME"          "Number"     $false   # m3/h consumo máximo equipo
New-Col "GN_Produccion" "HsProg"       "Number"     $false   # horas programadas
New-Col "GN_Produccion" "HsReal"       "Number"     $false   # horas reales
New-Col "GN_Produccion" "Consumo"      "Number"     $false   # m3 consumidos
New-Col "GN_Produccion" "Observacion"  "Text"       $false
New-Col "GN_Produccion" "Usuario"      "Text"       $false
New-Col "GN_Produccion" "Timestamp"    "DateTime"   $false
New-Col "GN_Produccion" "Editado"      "Boolean"    $false

# Índice en Fecha para rendimiento
Set-PnPField -List "GN_Produccion" -Identity "Fecha" -Values @{Indexed=$true} | Out-Null
Write-Host "  ✓ Índice en Fecha creado" -ForegroundColor Green

# ══════════════════════════════════════════════════════════════════════════════
# 2. GN_Distribuidora
#    Datos diarios de la distribuidora (autorizado, restringido, facturado)
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[ 2/8 ] GN_Distribuidora" -ForegroundColor Cyan
New-SPList "GN_Distribuidora" "Datos diarios distribuidora ECOGAS"
New-Col "GN_Distribuidora" "Fecha"       "DateTime"  $true
New-Col "GN_Distribuidora" "Nominado"    "Number"     $false
New-Col "GN_Distribuidora" "Autorizado"  "Number"     $false
New-Col "GN_Distribuidora" "AutRev"      "Number"     $false   # autorizado revisado
New-Col "GN_Distribuidora" "AutOrig"     "Number"     $false   # autorizado original
New-Col "GN_Distribuidora" "Restringido" "Number"     $false
New-Col "GN_Distribuidora" "Disponible"  "Number"     $false
New-Col "GN_Distribuidora" "Facturado"   "Number"     $false
New-Col "GN_Distribuidora" "PCI"         "Number"     $false
New-Col "GN_Distribuidora" "Observacion" "Text"       $false
New-Col "GN_Distribuidora" "AutRevUser"  "Text"       $false
New-Col "GN_Distribuidora" "AutRevTs"    "DateTime"   $false

Set-PnPField -List "GN_Distribuidora" -Identity "Fecha" -Values @{Indexed=$true} | Out-Null
Write-Host "  ✓ Índice en Fecha creado" -ForegroundColor Green

# ══════════════════════════════════════════════════════════════════════════════
# 3. GN_Lecturas
#    Lecturas de caudalímetros (4 veces por día)
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[ 3/8 ] GN_Lecturas" -ForegroundColor Cyan
New-SPList "GN_Lecturas" "Lecturas de caudalímetros - Gas Natural"
New-Col "GN_Lecturas" "Fecha"      "DateTime"  $true
New-Col "GN_Lecturas" "Hora"       "Text"       $true    # "06:00","14:00","18:00","22:00"
New-Col "GN_Lecturas" "Ubicacion"  "Choice"     $true @("CABINA MEDICION","CALDERA 10 Tn","CALDERA 4,5 Tn","ZIMMER","RAMA01","RAMA02","RAMA03")
New-Col "GN_Lecturas" "Caudal"     "Number"     $true    # m3/h
New-Col "GN_Lecturas" "Editado"    "Boolean"    $false
New-Col "GN_Lecturas" "Usuario"    "Text"       $false
New-Col "GN_Lecturas" "Timestamp"  "DateTime"   $false

Set-PnPField -List "GN_Lecturas" -Identity "Fecha" -Values @{Indexed=$true} | Out-Null
Write-Host "  ✓ Índice en Fecha creado" -ForegroundColor Green

# ══════════════════════════════════════════════════════════════════════════════
# 4. EE_Trafos
#    Consumo mensual por transformador (energía eléctrica)
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[ 4/8 ] EE_Trafos" -ForegroundColor Cyan
New-SPList "EE_Trafos" "Consumo mensual por transformador - Energía Eléctrica"
New-Col "EE_Trafos" "Mes"         "Text"    $true    # YYYY-MM
New-Col "EE_Trafos" "Trafo01"     "Number"  $false   # kWh medido (antes de factor)
New-Col "EE_Trafos" "Trafo02"     "Number"  $false
New-Col "EE_Trafos" "Trafo03"     "Number"  $false
New-Col "EE_Trafos" "Trafo04"     "Number"  $false
New-Col "EE_Trafos" "Trafo05"     "Number"  $false
New-Col "EE_Trafos" "Trafo06"     "Number"  $false
New-Col "EE_Trafos" "Trafo07"     "Number"  $false
New-Col "EE_Trafos" "Trafo08"     "Number"  $false
New-Col "EE_Trafos" "Trafo09"     "Number"  $false
New-Col "EE_Trafos" "Trafo10"     "Number"  $false
New-Col "EE_Trafos" "TotalKWh"    "Number"  $false   # suma trafos corregida por factor
New-Col "EE_Trafos" "SmecKWh"     "Number"  $false   # medidor principal SMEC
New-Col "EE_Trafos" "Usuario"     "Text"    $false
New-Col "EE_Trafos" "Timestamp"   "DateTime" $false

Set-PnPField -List "EE_Trafos" -Identity "Mes" -Values @{Indexed=$true} | Out-Null
Write-Host "  ✓ Índice en Mes creado" -ForegroundColor Green

# ══════════════════════════════════════════════════════════════════════════════
# 5. EE_Compresores
#    Horas mensuales de compresores de aire comprimido
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[ 5/8 ] EE_Compresores" -ForegroundColor Cyan
New-SPList "EE_Compresores" "Horas mensuales compresores - Energía Eléctrica"
New-Col "EE_Compresores" "Mes"          "Text"    $true
New-Col "EE_Compresores" "Compresor"    "Text"    $true    # C01, C02, etc.
New-Col "EE_Compresores" "HsCarga"      "Number"  $false
New-Col "EE_Compresores" "HsDescarga"   "Number"  $false
New-Col "EE_Compresores" "DiasTerminado" "Number" $false
New-Col "EE_Compresores" "DiasHilanderia" "Number" $false
New-Col "EE_Compresores" "Usuario"      "Text"    $false
New-Col "EE_Compresores" "Timestamp"    "DateTime" $false

Set-PnPField -List "EE_Compresores" -Identity "Mes" -Values @{Indexed=$true} | Out-Null
Write-Host "  ✓ Índice en Mes creado" -ForegroundColor Green

# ══════════════════════════════════════════════════════════════════════════════
# 6. EE_Agua
#    Horas mensuales de pozos de agua de perforación
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[ 6/8 ] EE_Agua" -ForegroundColor Cyan
New-SPList "EE_Agua" "Horas mensuales pozos de agua - Energía Eléctrica"
New-Col "EE_Agua" "Mes"           "Text"    $true
New-Col "EE_Agua" "Pozo"          "Text"    $true    # P1, P2
New-Col "EE_Agua" "HsMarcha"      "Number"  $false
New-Col "EE_Agua" "PctHilanderia" "Number"  $false
New-Col "EE_Agua" "PctTejeria"    "Number"  $false
New-Col "EE_Agua" "PctTerminado"  "Number"  $false
New-Col "EE_Agua" "Usuario"       "Text"    $false
New-Col "EE_Agua" "Timestamp"     "DateTime" $false

Set-PnPField -List "EE_Agua" -Identity "Mes" -Values @{Indexed=$true} | Out-Null
Write-Host "  ✓ Índice en Mes creado" -ForegroundColor Green

# ══════════════════════════════════════════════════════════════════════════════
# 7. Prod_Indicadores
#    Datos de producción diarios para cálculo de consumo/costo específico
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[ 7/8 ] Prod_Indicadores" -ForegroundColor Cyan
New-SPList "Prod_Indicadores" "Producción diaria para indicadores energéticos"
New-Col "Prod_Indicadores" "Fecha"       "DateTime"  $true
# Gas Natural
New-Col "Prod_Indicadores" "mTint"       "Number"    $false   # metros Tintorería
New-Col "Prod_Indicadores" "mEst"        "Number"    $false   # metros Estampado
New-Col "Prod_Indicadores" "KgEnc"       "Number"    $false   # kg Encolado
# Energía Eléctrica
New-Col "Prod_Indicadores" "PasTejPl"    "Number"    $false   # pasadas Tejeduría Planos
New-Col "Prod_Indicadores" "PasTejTs"    "Number"    $false   # pasadas Tejeduría Toallas
New-Col "Prod_Indicadores" "KgHil"       "Number"    $false   # kg Hilandería
New-Col "Prod_Indicadores" "mDbl"        "Number"    $false   # metros doblados Terminado
New-Col "Prod_Indicadores" "Usuario"     "Text"      $false
New-Col "Prod_Indicadores" "Timestamp"   "DateTime"  $false

Set-PnPField -List "Prod_Indicadores" -Identity "Fecha" -Values @{Indexed=$true} | Out-Null
Write-Host "  ✓ Índice en Fecha creado" -ForegroundColor Green

# ══════════════════════════════════════════════════════════════════════════════
# 8. Auditoria
#    Log persistente de todas las acciones del sistema
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "[ 8/8 ] Auditoria" -ForegroundColor Cyan
New-SPList "Auditoria" "Log de auditoría del sistema"
New-Col "Auditoria" "Tipo"        "Text"      $true
New-Col "Auditoria" "Detalle"     "Note"      $false
New-Col "Auditoria" "Usuario"     "Text"      $false
New-Col "Auditoria" "Rol"         "Text"      $false
New-Col "Auditoria" "Timestamp"   "DateTime"  $true
New-Col "Auditoria" "ValorAntes"  "Note"      $false
New-Col "Auditoria" "ValorDespues" "Note"     $false

Set-PnPField -List "Auditoria" -Identity "Timestamp" -Values @{Indexed=$true} | Out-Null
Write-Host "  ✓ Índice en Timestamp creado" -ForegroundColor Green

# ══════════════════════════════════════════════════════════════════════════════
# RESUMEN FINAL
# ══════════════════════════════════════════════════════════════════════════════
Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ✓ Todas las listas creadas correctamente" -ForegroundColor Green
Write-Host "  Sitio: $SiteUrl" -ForegroundColor Gray
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "PRÓXIMO PASO: Ejecutar migrar_datos.js en el navegador" -ForegroundColor Yellow
