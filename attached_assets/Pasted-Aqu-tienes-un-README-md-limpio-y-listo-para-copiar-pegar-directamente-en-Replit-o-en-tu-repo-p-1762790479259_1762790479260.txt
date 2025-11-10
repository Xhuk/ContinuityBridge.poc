Aquí tienes un **README.md limpio y listo para copiar/pegar directamente en Replit** (o en tu repo privado). Está escrito para que Replit lo entienda, con instrucciones claras, comandos que funcionan ahí mismo, y explicando la arquitectura del POC y cómo debuggear.

---

# ContinuityBridge POC – Replit Ready 🚀

**Objetivo del POC:**
Demostrar el flujo completo:

```
BYDM / XML / JSON → YAML de mapeo → Canonical JSON → Validación (Ajv) → Mock endpoint
```

Con esto puedes presentar el demo mostrando:

* Transformación de una estructura BYDM a tu **modelo canónico**.
* Cómo escalar el motor conectando múltiples integraciones.
* Cómo soportar BYDM 2018 → BYDM 2025 sin romper código.
* Cómo agregar reglas/condiciones/extensiones sin recompilar.

---

## ✅ 1. Estructura del proyecto

```
/schemas/canonical/
    order.schema.json
    shipment.schema.json
    inbound.schema.json
    inventory.schema.json

/mappings/common/
    status_map.yaml
    uom.yaml

/mappings/bydm→canonical/
    order_release_to_canonical_order.yaml
    shipment_to_canonical_shipment.yaml
    receiving_advice_to_canonical_inbound.yaml
    inventory_report_to_canonical_inventory.yaml

/examples/
    orderRelease.sample.json
    shipment.sample.json
    receivingAdvice.sample.json
    inventoryReport.sample.json

/src/
    engine/mappingEngine.ts      # intérprete parcial de YAML
    mappers/                     # mappers TS alternativos
    index.ts                     # ejecuta un mapeo + valida
    demo_engine.ts               # corre todos los mapeos
    validate.ts                  # valida schemas
```

---

## ✅ 2. Cómo correr en Replit

Primero instala dependencias:

```bash
npm install
```

### Ejecutar un mapeo específico

```bash
npm run dev
```

Por defecto usa:

```
INPUT=examples/orderRelease.sample.json
MAP=mappings/bydm→canonical/order_release_to_canonical_order.yaml
SCHEMA=schemas/canonical/order.schema.json
```

Si quieres ejecutar otro:

```bash
INPUT=examples/shipment.sample.json \
MAP=mappings/bydm→canonical/shipment_to_canonical_shipment.yaml \
SCHEMA=schemas/canonical/shipment.schema.json \
npm run dev
```

---

## ✅ 3. Ejecutar todos los mapeos del POC

```bash
npm run demo:mappingEngine
```

Esto procesa:

* OrderRelease
* Shipment
* ReceivingAdvice
* InventoryReport

Y te imprime el JSON canónico final.

---

## ✅ 4. Validar que los schemas están correctos

```bash
npm run validate
```

Si algo falla, Ajv te mostrará exactamente dónde.

---

## ✅ 5. Cómo funciona el motor de YAML

El archivo `src/engine/mappingEngine.ts` implementa:

### 🔧 Comandos soportados en YAML

```
valueFrom:
mapArray:
when:
arrayOf:
object:
@merge:
```

### 🔧 Helpers disponibles

Dentro de `${ ... }` puedes usar:

* `uuid()`
* `now()` → ISO timestamp
* `nowEpoch()`
* `firstNonNull(...)`
* `concat(a,b,c)`
* `mapTable('status.order', value)`
* `asArray(x)`
* `flatten([a, b])`
* `uomConvert.weight(value, from, to)`
* `uomConvert.length(value, from, to)`

---

## ✅ 6. Ejemplo de YAML (resumen)

```yaml
order:
  mapArray:
    source: "$.lineItem[*]"
    as: li
    mapping:
      sku: "$.transactionalTradeItem.primaryId"
      qty:
        valueFrom:
          - "$.requestedQuantity.value"
          - "$.orderedQuantity.value"
          - 0
```

---

## ✅ 7. Integrar Mappers TS (opcional)

Si prefieres usar TypeScript en vez de YAML:

```ts
import { bydmOrderReleaseToCanonicalOrder } from "./src/mappers/bydm_order_mapper";

const canonical = bydmOrderReleaseToCanonicalOrder(input);
```

---

## ✅ 8. Cómo debuggear en Replit

### 1) Activar logging detallado

Edita `mappingEngine.ts` y agrega un log temporal:

```ts
console.log("DEBUG:", { nodeMapping, data });
```

### 2) Ver el árbol de BYDM real

```ts
console.log(JSON.stringify(input, null, 2));
```

### 3) Validación contra esquema

Si el esquema falla, Ajv imprime:

* qué campo falta
* qué tipo es incorrecto
* en qué posición está el error

---

## ✅ 9. Siguientes pasos recomendados

* Conectar mock endpoints:

  * `/mock/amazon/order`
  * `/mock/meli/order`
  * `/mock/3pl/intake`
  * `/mock/amazon/inbound`

* Agregar BYDM 2025 JSON reales

* Definir catálogo de warehouses (resuelve rutas)

* Agregar override por cliente:

  * mappings/overrides/accel.yaml

---

## ✅ 10. Comando para empaquetar salida del mapeo

```bash
npm run dev > output.json
```

Luego puedes subir `output.json` a un mock o Postman.

---

## ✅ 11. Conexión con tu pipeline real

Este POC está pensado para que, cuando aprueben el proyecto, simplemente:

* Sustituyas BYDM 2018 por los BYDM 2025
* Agregues los adaptadores de CDC/Kafka/RabbitMQ
* Mantengas los YAML como definición declarativa

---

## ✅ Si quieres habilito **mock server completo** con Express

Solo dime:

> "sí, generar servidor mock"

Y te agrego:

```
/src/mock/server.ts
npm run mock
```

para ver en un navegador cómo llegan los canónicos.

---

**Listo para copiar/pegar en tu Replit.**
