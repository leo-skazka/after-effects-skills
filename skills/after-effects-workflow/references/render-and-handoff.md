# Рендер After Effects и передача в Premiere

## Очередь и реальный файл

`preview_after_effects_render` только проверяет описание запроса, не связывается с AE. `enqueue_after_effects_render` сохраняет открытый проект и добавляет один элемент, но не запускает рендер. Проверь, что пользователь поручил именно эти побочные действия; подготовка preview сама по себе разрешения не даёт.

Названия Render Settings / Output Module templates локальны и могут отличаться по версии и языку. Читай фактически доступные шаблоны. `inspect_after_effects_render_templates` обычно читает первый существующий элемент очереди; `allow_temporary_queue_item: true` временно меняет очередь и требует edit authority. Не вызывай этот режим как якобы чистое чтение.

Для командного рендера используй обнаруженный `aerender.exe`, сохранённый AEP и конкретную композицию. Пример PowerShell с условными путями:

```powershell
& "C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\aerender.exe" -project "C:\Project\spot_v02.aep" -comp "SPOT_30s_v02" -RStemplate "Best Settings" -OMtemplate "Lossless" -output "C:\Project\exports\spot_v02.avi"
```

Это пример формы команды, а не обещание установленных шаблонов или рекомендуемый кодек. Подставь реальный путь и существующий шаблон, согласованный с форматом задания. Без `-comp` aerender выполняет очередь проекта; связанные параметры отдельной композиции могут быть проигнорированы. Последний кадр `-e` включителен: для кадров `0..N-1` укажи `-s 0 -e N-1` с учётом стартовой нумерации композиции. Не добавляй `-reuse` без намерения использовать уже работающий экземпляр AE.

До запуска проверь выходную папку и существование файла; используй отдельную версию. После завершения проверь файл через ffprobe/доступный delivery verifier и просмотри контрольные моменты. Код возврата не доказывает качество картинки и полноту звука.

## Альфа

Расширение `.mov` не гарантирует прозрачность. Для прозрачной графики согласуй кодек, `RGB+Alpha`, глубину и Straight/Premultiplied. ProRes 4444 / 4444 XQ поддерживают альфу; ProRes 422 — нет. Для графики, поверх которой будет видеомонтаж, проверь края на светлом и тёмном фоне. Не добавляй непрозрачный полноэкранный фон, если заказана альфа.

## Premiere / Dynamic Link

`preview_send_clip_to_after_effects` читает конкретный клип и готовит перенос в уже открытый сохранённый AE-проект. Он может отказать для retimed, reversed, offline или неподходящего источника. Прочитай ограничения и список эффектов, которые не переносятся. `apply_send_clip_to_after_effects` создаёт композицию, сохраняет AEP, импортирует Dynamic Link и заменяет клип; это изменение обоих проектов, а не инспекция.

Для уже отрендеренного файла `preview_after_effects_render_handoff` / `apply_after_effects_render_handoff` импортируют файл в конкретный bin. Импорт не означает замену клипа на таймлайне. Для замены требуется отдельная поддерживаемая операция с проверкой длительности, звука и итогового диапазона.

Не объявляй Dynamic Link надёжнее файлового экспорта по умолчанию: выбирай по задаче, доступным версиям приложений и состоянию мостов.

## Документация

- [Adobe: aerender и network rendering](https://helpx.adobe.com/after-effects/desktop/render-and-export/automate-rendering/automated-rendering-network-rendering.html).
- [Adobe: основы render/output module](https://helpx.adobe.com/after-effects/desktop/render-and-export/basics-of-rendering-and-exporting/basics-rendering-exporting.html).
- [Apple: семейство ProRes и альфа](https://support.apple.com/en-us/102207).
