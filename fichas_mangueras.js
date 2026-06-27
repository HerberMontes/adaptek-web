/* ADAPTEKK · Fichas tecnicas de mangueras (Strobbe 2026, pag A27-A38 Hardcover).
   Mapea TIPO de manguera (el bloque del codigo AT: ATM-{TIPO}-...) -> norma, refuerzo,
   temperatura, normas/ISO, sistemas de conexion y APLICACIONES para segmentar el configurador.
   Las Premium (740.xxx) comparten norma con el Hardcover del mismo tipo. */
// Fluidos compatibles (comun a todas: tubo NBR resistente al aceite). Informativo.
var FLUIDOS_NBR = {
  aptos: ["Aceite hidráulico (mineral/petróleo)","Fluidos base agua (agua-glicol, emulsiones)","Aceites vegetales y ésteres sintéticos","Combustibles (diésel, gasolina)","Agua"],
  noAptos: ["Ésteres de fosfato","Químicos corrosivos / ácidos"]
};
var FICHAS_MANGUERAS = {
  "R1AT": { nombre:"R1AT / 1SN", norma:"SAE 100 R1AT / EN 853-1SN", refuerzo:"1 malla de acero",
            tempC:[-40,100], vidaUtil:"150,000 impulsos", sistemas:["DuoFit"], presionPsi:[580,3600],
            aplicaciones:["general","media_presion"] },
  "R17":  { nombre:"R17 Isobaric 3000", norma:"SAE 100 R17", refuerzo:"1 malla de acero",
            tempC:[-40,100], vidaUtil:"200,000 impulsos", sistemas:["DuoFit"], presionPsi:[3000,3000],
            isobarica:true, msha:true, aplicaciones:["presion_constante","mineria_msha","general"] },
  "R2AT": { nombre:"R2AT / 2SN", norma:"SAE 100 R2AT / EN 853-2SN", refuerzo:"2 mallas de acero",
            tempC:[-40,100], vidaUtil:"200,000 impulsos", sistemas:["DuoFit","TetraFit"], presionPsi:[1160,5800],
            aplicaciones:["general","alta_presion"] },
  "R16":  { nombre:"R16 / 2SC compacta", norma:"SAE 100 R16 / EN 857-2SC", refuerzo:"2 mallas de acero (compacta)",
            tempC:[-40,100], vidaUtil:"200,000 impulsos", sistemas:["DuoFit","TetraFit"], presionPsi:[1810,5800],
            msha:true, compacta:true, aplicaciones:["compacta","alta_presion","mineria_msha"] },
  "R12":  { nombre:"R12", norma:"SAE 100 R12 / EN 856-R12", refuerzo:"4 espirales de acero",
            tempC:[-40,120], vidaUtil:"500,000 impulsos", sistemas:["DuoFit","TetraFit"], presionPsi:[2500,4000],
            aplicaciones:["alta_presion","impulsos","presion_constante"] },
  "4SH":  { nombre:"4SH", norma:"EN 856-4SH", refuerzo:"4 espirales de acero",
            tempC:[-40,100], vidaUtil:"400,000 impulsos", sistemas:["TetraFit","HexaFit"], presionPsi:[3600,6525],
            msha:true, aplicaciones:["muy_alta_presion","gran_caudal","mineria_msha"] },
  "R13":  { nombre:"R13", norma:"SAE 100 R13 / ISO 18752-CC Clase 350", refuerzo:"4 a 6 espirales de acero",
            tempC:[-40,120], vidaUtil:"500,000 impulsos", sistemas:["HexaFit"], presionPsi:[5000,5000],
            msha:true, isobarica:true, aplicaciones:["muy_alta_presion","presion_constante","mineria_msha"] },
  "R15":  { nombre:"R15", norma:"SAE 100 R15 / ISO 18752-CC Clase 420", refuerzo:"4 a 6 espirales de acero",
            tempC:[-40,120], vidaUtil:"500,000 impulsos", sistemas:["HexaFit"], presionPsi:[6000,6000],
            msha:true, isobarica:true, aplicaciones:["muy_alta_presion","presion_constante","mineria_msha"] }
};
// Catalogo de aplicaciones (etiqueta visible + descripcion) para el selector del configurador
var APLICACIONES_MANGUERA = {
  general:           { label:"Hidráulica general",        sub:"Uso común en maquinaria" },
  media_presion:     { label:"Media presión",             sub:"Líneas de baja-media carga" },
  alta_presion:      { label:"Alta presión",              sub:"Sistemas exigentes" },
  muy_alta_presion:  { label:"Muy alta presión",          sub:"Espiral, trabajo pesado" },
  presion_constante: { label:"Presión constante",         sub:"Misma presión en toda la medida" },
  impulsos:          { label:"Ciclos de impulso",         sub:"Alta vida útil a fatiga" },
  compacta:          { label:"Espacios reducidos",        sub:"Diámetro exterior compacto" },
  gran_caudal:       { label:"Gran caudal",               sub:"Diámetros grandes" },
  mineria_msha:      { label:"Minería / antiflama (MSHA)",sub:"Retardante de flama" },
  marine:            { label:"Ambientes marinos",         sub:"Resistente a corrosión marina" }
};
if (typeof module!=="undefined") module.exports = { FICHAS_MANGUERAS:FICHAS_MANGUERAS, APLICACIONES_MANGUERA:APLICACIONES_MANGUERA, FLUIDOS_NBR:FLUIDOS_NBR };
