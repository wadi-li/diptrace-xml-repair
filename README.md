# Ремонт библиотек DipTrace XML (.libxml / .elixml)

[Открыть онлайн](https://wadi-li.github.io/diptrace-xml-repair/) · [Скачать HTML](diptrace-xml-repair.html) · [Сценарий индексации 3D-моделей](dt-models3d-index.cmd)

Автономный HTML-инструмент: `diptrace-xml-repair.html` (открыть в браузере, интернет не нужен).

- Терпимый разбор повреждённого XML (обрезка, незакрытые теги, NUL, неэкранированные & <), запись в стиле DipTrace (CRLF, BOM, без отступов; без правок — побайтно тот же файл).
- Проверки по спецификациям DipTrace: https://diptrace.com/support/tutorials/xml_specs_PattEdit_html/ , https://diptrace.com/support/tutorials/xml_specs_CompEdit_html/
- Исправление отмеченного → `<имя>.fixed.<ext>` + журнал CSV (`;`, UTF-8 BOM).
- Поиск причины зависания делением пополам (части A/B с новым Name/UID32), варианты «без 3D/полей/категорий/RecoveryCode/…».
- Проверка наличия 3D-моделей по выбранным папкам.

Сборка: `python3 build.py` (src/*.js + src/app.html → diptrace-xml-repair.html). Тест: `node test/t.js <файл.libxml|.elixml>` — проверка, исправление и повторная проверка в Node.js.

## Автоматическая проверка 3D-моделей

`dt-models3d-index.cmd` положить в папку с `diptrace-xml-repair.html` и запустить: он запишет `dt-models3d-index.js` (имена файлов и признак «только в облаке» OneDrive из папок `C:\Users\limar\OneDrive\DipTrace\models3d` и `C:\Program Files\DipTrace\models3d`). Инструмент подхватывает его сам при открытии и по кнопке «Проверить 3D-модели». Сценарий с другими путями можно скачать из самого инструмента.

Онлайн-версия работает так же, файлы обрабатываются только в браузере и никуда не отправляются. Автоматическая проверка 3D-моделей по `dt-models3d-index.js` работает только в локальной копии HTML, лежащей рядом с этим файлом; онлайн доступен разовый выбор папок вручную.
