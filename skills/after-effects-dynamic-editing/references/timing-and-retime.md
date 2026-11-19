# Диапазоны, музыкальная сетка и Time Remap

## Единицы и диапазоны

Храни монтажные границы в целых кадрах выходной композиции; перевод в секунды делай только на границе AE API: `frame / comp.frameRate`. Исходные диапазоны храни в секундах source media. Пара `[in, out)` исключает кадр на `out`.

У слоя без ретайминга и при `stretch = 100`:

```javascript
layer.startTime = timelineInFrame / fps - sourceInSeconds;
layer.inPoint = timelineInFrame / fps;
layer.outPoint = (timelineInFrame + durationFrames) / fps;
```

`startTime` задаёт сдвиг начала источника относительно композиции; `inPoint`/`outPoint` задают видимый диапазон слоя. Установка только `inPoint` не означает, что выбран нужный исходный кадр. Исходный FPS не равен выходному: секунды источника и секунды композиции — разные координаты при ретайминге.

С BPM 120 и FPS 30 шаг бита равен 15 кадрам. При 29.97 или другой дробной сетке округляй каждую абсолютную точку независимо. BPM и offset должны соответствовать реальной записи; live drums и смены темпа требуют отдельных секций/маркеров вместо одной сетки.

## Кривая Time Remap

`ADBE Time Remapping` содержит **секунды источника**, а позиции ключей задаются в секундах композиции. Наклон кривой — скорость: наклон 1 означает обычное воспроизведение, 0 — намеренную остановку.

В `build-edit.jsx` поле `retimeKeys` задаёт локальный выходной кадр и абсолютные секунды источника. Например, при 30 FPS:

```javascript
retimeKeys: [
    { frame: 0, sourceSeconds: 1.0 },
    { frame: 15, sourceSeconds: 1.75 },
    { frame: 45, sourceSeconds: 2.0 },
    { frame: 60, sourceSeconds: 2.75 }
]
```

Этот двухсекундный план берёт источник `[1.0, 2.75)` и замедляет середину. Между контрольными точками применяется монотонный кубический Hermite с ограниченными касательными; результат запекается в линейные ключи на каждом выходном кадре. Границы и монотонность сохраняются. Это кадровая аппроксимация плавного изменения скорости, а не субкадровая кривая с авторскими Bezier handles. Для motion blur, Pixel Motion, полей или субкадровой композиции проверяй такой bake на контрольном рендере; при необходимости строй нативную кривую и проверяй `valueAtTime()`.

Требуются точки на `frame: 0` и на эксклюзивном `frame: durationFrames`; их `sourceSeconds` должны совпадать с `sourceInSeconds` и `sourceOutSeconds`. Между точками время источника не уменьшается. Повтор времени внутри диапазона задаёт намеренный hold. Reverse этим шаблоном не поддерживается.

После включения Time Remap AE создаёт начальные ключи. Шаблон удаляет их и ставит свои. Последний выходной ключ находится на `durationFrames - 1`, а `outPoint` — на `durationFrames`. Эксклюзивная конечная точка используется в расчёте, но не отображается: источник на `source.duration` не попадает в последний кадр и не создаёт случайную пустоту/длинный freeze. Любую намеренную остановку проверь отдельно.

## Данные шаблона

`EDIT_CONFIG` задаётся в JavaScript, без внешнего JSON-парсера или дополнительных файлов. Поля клипа:

| Поле | Значение |
|---|---|
| `path` | Полный локальный путь; Windows можно записывать `C:/Media/shot.mov` |
| `timelineInFrame`, `durationFrames` | Целые выходные кадры |
| `sourceInSeconds`, `sourceOutSeconds` | Исходный диапазон `[in, out)` |
| `fit` | `cover` или `contain`; всегда центр, ручной reframe выполняется отдельно |
| `audio` | Оставить звук клипа; по умолчанию `false` |
| `retimeKeys` | Необязательная монотонная time-map; без неё отличная длина источника даёт постоянную скорость |

Шаблон отказывает при перекрывающихся планах: для осмысленного перехода надо отдельно определить overlap, слои и обработку звука. Пустые участки остаются фоном композиции. Музыка задаётся через `music.path`, `sourceInSeconds`, `timelineInFrame`, `gainDb`; короткий трек не зацикливается автоматически.

## Источники

- Adobe: [Time-stretching and time-remapping](https://helpx.adobe.com/after-effects/using/time-stretching-time-remapping.html) — различие stretch/remap и визуальные ограничения интерполяции.
- Adobe: [Layer markers and composition markers](https://helpx.adobe.com/after-effects/using/layer-markers-composition-markers.html) — маркеры и монтажные ориентиры.
- Поддерживаемый сообществом After Effects Scripting Guide: [Layer](https://ae-scripting.docsforadobe.dev/layer/layer/), [AVLayer](https://ae-scripting.docsforadobe.dev/layer/avlayer/), [Property](https://ae-scripting.docsforadobe.dev/property/property/) — `startTime`, границы, Time Remap и запись ключей. Это отдельный справочник сообщества, не обещание наличия MCP-функций.
