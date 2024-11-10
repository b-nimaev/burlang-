import { Composer, Scenes, Markup } from "telegraf";
import { MyContext } from "../types/MyContext";
import { sendOrEditMessage } from "..";
import { IWordModel } from "../types/WordModel";
import TelegramUser from "../types/TelegramUserModel";

// Описываем тип для состояния Wizard-сцены
interface WizardState {
  language?: string;
  suggestion?: boolean;
  selectedWordId?: string; // Добавляем свойство для хранения _id выбранного слова
  selectedDialect?: string;
  normalized_text?: string;
}

// Словари для перевода языков и диалектов с индекс сигнатурой
const languageNames: { [key: string]: string } = {
  russian: "Русский язык",
  buryat: "Бурятский язык",
  // Добавьте другие языки, если они есть
};

const dialectNames: { [key: string]: string } = {
  khori: "Хоринский диалект",
  bulagat: "Булагатский диалект",
  sartul: "Сартульский диалект",
  unknown: "Неизвестный диалект",
  // Добавьте другие диалекты, если они есть
};

// Массив бурятских диалектов
const dialects = [
  { value: "khori", label: "Хоринский" },
  { value: "bulagat", label: "Булагатский" },
  { value: "sartul", label: "Сартульский" },
  { value: "unknown", label: "Не знаю" },
];

// Функция для отправки POST-запроса
async function postRequest(url: string, body: object, token: string) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

// Функция для формирования сообщения с результатами
async function createResultMessage(
  words: IWordModel[],
  total_count: number,
  page: number,
  limit: number
) {
  // Вычисляем общее количество страниц
  const totalPages = Math.ceil(total_count / limit);

  let resultMessage = `<b>Словарь — Добавление переводов ✍️</b>\n\n`;
  // Формируем строку с указанием текущей страницы и общего количества страниц
  resultMessage += `<b>Страница ${page}/${totalPages}</b>\n`;
  resultMessage += `<i>Показано  ${page * limit - limit + 1}-${Math.min(
    page * limit,
    total_count
  )} из ${total_count} слов которым нужно добавить перевод</i>\n\n`;

  words.forEach((word, index) => {
    const languageFullName = languageNames[word.language] || word.language;
    const dialectFullName = word.dialect
      ? dialectNames[word.dialect] || word.dialect
      : "";

    // Если индекс не равен 10, добавляем пробел после номера
    const indexStr = index + 1 === 10 ? `${index + 1}. ` : `${index + 1}.  `;

    resultMessage += `${indexStr}${word.text} – <i>${languageFullName}${
      dialectFullName ? `, ${dialectFullName}` : ""
    }</i>\n`;
  });

  resultMessage += `\n<i><b>Выберите номер слова, к которому будете добавлять перевод</b></i>`;

  return resultMessage;
}

interface WordsOnApprovalResponse {
  words: IWordModel[];
  total_count: number;
}

// Функция для отправки запроса к API и отображения результатов
async function fetchWordsOnApproval(
  ctx: MyContext,
  page = 1,
  limit = 10,
  reply = false
) {
  try {
    const apiUrl = process.env.api_url;
    const response = await fetch(
      `${apiUrl}/vocabulary/approval?page=${page}&limit=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.admintoken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      const data = (await response.json()) as WordsOnApprovalResponse;
      const { words, total_count } = data;

      // Формируем результат и клавиатуру
      const resultMessage = await createResultMessage(
        words,
        total_count,
        page,
        limit
      );

      const selectionButtons = [
        words
          .slice(0, 5)
          .map((_word: IWordModel, index: number) =>
            Markup.button.callback(`${index + 1}`, `select_word_${index}`)
          ),
        words
          .slice(5, 10)
          .map((_word: IWordModel, index: number) =>
            Markup.button.callback(`${index + 6}`, `select_word_${index + 5}`)
          ),
      ];

      const paginationButtons = [
        Markup.button.callback("⬅️", "prev_page"),
        Markup.button.callback("Назад", "back"),
        Markup.button.callback("➡️", "next_page"),
      ];

      const selectionKeyboard = Markup.inlineKeyboard([
        ...selectionButtons,
        paginationButtons,
      ]);
      ctx.session.page = page;

      await sendOrEditMessage(ctx, resultMessage, selectionKeyboard, reply);
      ctx.wizard.selectStep(3);
    } else {
      await ctx.reply("Ошибка при получении данных.");
    }
  } catch (error) {
    console.error(error);
    await ctx.reply("Произошла ошибка при запросе.");
  }
}

// Сцена "Словарь"
const dictionaryWizard = new Scenes.WizardScene<
  MyContext & { wizard: { state: WizardState } }
>(
  "dictionary-wizard",
  new Composer<MyContext>(),

  // Шаг 1: Получение текста от пользователя и его перевод
  async (ctx) => {
    if (ctx.message && "text" in ctx.message) {
      const userInput = ctx.message.text;
      const language = ctx.wizard.state.language;

      if (language) {
        await ctx.reply(
          `Перевод для "${userInput}" с ${language}: ${userInput}`
        );
      } else {
        await ctx.reply("Пожалуйста, выберите язык для перевода.");
      }

       ctx.scene.enter("dictionary-wizard"); // Возврат к сцене после обработки
    } else {
      await ctx.reply("Пожалуйста, введите текст.");
    }
  },

  // Шаг 2: Отправка слова на сервер через API
  async (ctx) => {
    if (ctx.message && "text" in ctx.message) {
      const userInput = ctx.message.text;
      const language = ctx.wizard.state.language || "не указан";

      if (ctx.from) {
        const userId = ctx.from.id;
        if (userInput) {
          try {
            const apiUrl = process.env.api_url;
            const adminToken = process.env.admintoken || "";

            const requestBody = {
              text: userInput,
              language: language === "russian" ? "russian" : "buryat",
              telegram_user_id: userId,
              dialect: ctx.wizard.state.selectedDialect || "khori",
            };

            const response = await postRequest(
              `${apiUrl}/vocabulary/suggest-words`,
              requestBody,
              adminToken
            );

            if (response.ok) {
              await ctx.reply(
                `Ваше предложение успешно отправлено: ${userInput}`
              );
            } else {
              const errorMsg = await response.text();
              await ctx.reply(`Ошибка при отправке предложения: ${errorMsg}`);
            }
          } catch (error) {
            console.error("Ошибка при отправке:", error);
            await ctx.reply(
              "Произошла ошибка при отправке вашего предложения."
            );
          }

          ctx.scene.enter("dictionary-wizard"); // Возврат к сцене
        }
      } else {
        await ctx.reply("Не удалось определить пользователя.");
      }
    } else {
      await ctx.reply("Пожалуйста, введите текст.");
    }
  },

  // Шаг 3: Модерация предложенных слов (обработка сообщений и callback_query)
  async (ctx) => {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const action = ctx.callbackQuery.data;

      if (action === "approve_word" || action === "reject_word") {
        const wordId = ctx.wizard.state.selectedWordId;
        const userId = ctx.from?.id;

        if (!wordId || !userId) {
          await ctx.reply("Не удалось определить пользователя или слово.");
          return;
        }

        const apiUrl = process.env.api_url;
        const actionUrl =
          action === "approve_word"
            ? `${apiUrl}/vocabulary/accept-suggested-word`
            : `${apiUrl}/vocabulary/decline-suggested-word`;

        const response = await postRequest(
          actionUrl,
          { suggestedWordId: wordId, telegram_user_id: userId },
          process.env.admintoken!
        );
        if (!response.ok) {
          let errorMessage = "Ошибка при выполнении запроса.";
          try {
            const errorData = await response.json();

            if (typeof errorData === "object" && errorData !== null && "message" in errorData) {
              errorMessage = (errorData as { message: string }).message;
            }
          } catch (e) {
            // В случае, если ответ не JSON, оставляем стандартное сообщение об ошибке
          }
          await ctx.reply(`Ошибка: ${errorMessage}`);
        }

      } else if (action === "skip_word") {
        await ctx.reply("Слово пропущено.");
        ctx.scene.enter("dictionary-wizard");
      }

      await ctx.answerCbQuery();
    }
  }
);

interface getConfirmedWordResponse {
  message: string;
  word: IWordModel
}

interface getAllWordsPaginatedResponse {
  message: string;
  words: IWordModel[];
  totalWords: number;
  currentPage: number;
  totalPages: number;
}

// Шаг 4: Обработка выбора слова для перевода и навигации
dictionaryWizard.use(async (ctx, next) => {
  if (ctx.wizard.cursor === 4) {
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const callbackData = (ctx.callbackQuery as any).data;

      // Обрабатываем выбор слова, используя _id
      if (callbackData.startsWith("select_word_")) {
        const selectedWordId = callbackData.split("_").pop(); // Извлекаем _id слова
        // Сохраняем _id выбранного слова в состоянии
        ctx.wizard.state.selectedWordId = selectedWordId;

        try {
          // Запрос на API для получения данных о выбранном слове
          const apiUrl = process.env.api_url;
          const response = await fetch(
            `${apiUrl}/vocabulary/confirmed-word?wordId=${selectedWordId}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${process.env.admintoken}`,
                "Content-Type": "application/json",
              },
            }
          );
          const data = (await response.json()) as getConfirmedWordResponse;

          if (response.ok) {
            const word = data.word; // Получаем данные о слове

            // Обновляем стейты в wizard
            ctx.wizard.state.selectedWordId = selectedWordId;
            ctx.wizard.state.language =
              word.language.toLowerCase() === "russian" ||
              word.language.toLowerCase() === "русский"
                ? "russian"
                : "buryat"; // Обновляем язык выбранного слова
            ctx.wizard.state.selectedDialect =
              ctx.wizard.state.selectedDialect || "khori"; // Обновляем диалект, если он есть
            ctx.wizard.state.normalized_text = word.normalized_text || ""; // Обновляем normalized_text, если он есть

            // Проверяем, если язык слова не "русский" или "russian", выводим диалект
            const dialectInfo =
              ctx.wizard.state.language === "buryat"
                ? `\nДиалект: ${word.dialect || "не указан"}`
                : "";

            // Отображаем информацию о слове пользователю
            let wordDetails = `<b>Добавление перевода ✍️</b>\n\nВыбранное слово: <b>${word.text}</b>\nЯзык: ${word.language}${dialectInfo}`;

            if (word.translations_u.length) {
              wordDetails += `<b>Предложенные переводы:</b>\nНа рассмотрении: `;
              for (let i = 0; i < word.translations_u.length; i++) {
                const translation = word.translations_u[i];
                wordDetails += `${translation.text}`;
                if (i < word.translations_u.length - 1) {
                  wordDetails += ", ";
                }
              }
            }

            // Проверяем язык и формируем клавиатуру в зависимости от языка
            let keyboard;
            if (ctx.wizard.state.language === "buryat") {
              // Для бурятского языка формируем клавиатуру с диалектами
              const selectedDialect =
                ctx.wizard.state.selectedDialect || dialects[0].value;
              const dialectButtons = dialects.map((dialect) =>
                Markup.button.callback(
                  `${selectedDialect === dialect.value ? "✅ " : ""}${
                    dialect.label
                  }`,
                  `select_dialect_${dialect.value}`
                )
              );

              // Группируем кнопки по две в ряд
              const groupedDialectButtons = [];
              for (let i = 0; i < dialectButtons.length; i += 2) {
                groupedDialectButtons.push(dialectButtons.slice(i, i + 2));
              }

              // Добавляем кнопку "Назад" в отдельную строку
              groupedDialectButtons.push([
                Markup.button.callback("Назад", "back"),
              ]);

              keyboard = Markup.inlineKeyboard(groupedDialectButtons);
            } else {
              // Для русского языка только кнопка "Назад"
              keyboard = Markup.inlineKeyboard([
                Markup.button.callback("Назад", "back"),
              ]);
            }

            // Отправляем сообщение с информацией о слове и клавиатурой
            await sendOrEditMessage(
              ctx,
              `${wordDetails}\n\nВведите перевод для этого слова:`,
              keyboard
            );

            // Переход на следующий шаг (5), где будет вводиться перевод
            ctx.wizard.selectStep(5);
          } else {
            await ctx.reply("Ошибка при получении данных о слове.");
          }
        } catch (error) {
          console.error("Ошибка при получении данных о слове:", error);
          await ctx.reply("Произошла ошибка при запросе.");
        }
      }

      // Обработка пагинации для кнопки "⬅️" (предыдущая страница)
      if (callbackData === "back") {
        await ctx.scene.enter("dictionary-wizard");
      }

      if (callbackData === "prev_page") {
        const currentPage = ctx.session.page || 1;
        if (currentPage > 1) {
          const prevPage = currentPage - 1;

          ctx.session.page = prevPage;
          await fetchPaginatedWords(ctx, prevPage, 10);
        } else {
          await ctx.answerCbQuery("Это первая страница.");
        }
      }

      // Обработка пагинации для кнопки "➡️" (следующая страница)
      if (callbackData === "next_page") {
        const currentPage = ctx.session.page || 1;
        const limit = 10;

        const apiUrl = process.env.api_url;
        const response = await fetch(
          `${apiUrl}/vocabulary/paginated?page=${currentPage}&limit=${limit}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.admintoken}`,
              "Content-Type": "application/json",
            },
          }
        );
        const data = (await response.json()) as getAllWordsPaginatedResponse;

        if (response.ok) {
          const totalWords = data.totalWords;
          const totalPages = Math.ceil(totalWords / limit);

          if (currentPage < totalPages) {
            const nextPage = currentPage + 1;
            ctx.session.page = nextPage;
            await fetchPaginatedWords(ctx, nextPage, 10);
          } else {
            await ctx.answerCbQuery("Это последняя страница.");
          }
        } else {
          await ctx.reply("Ошибка при получении данных.");
        }
      }

      await ctx.answerCbQuery();
    }
  } else {
    return next();
  }
});


interface getUserResponse {
  message: string;
  is_exists: boolean;
  user: TelegramUser
}

// Шаг 5: Обработка действий с выбранным словом
dictionaryWizard.use(async (ctx, next) => {
  if (ctx.wizard.cursor === 5) {
    if (ctx.message && "text" in ctx.message) {
      const translation = ctx.message.text;
      const wordId = ctx.wizard.state.selectedWordId;

      // Проверка наличия перевода и выбранного слова
      if (!translation || !wordId) {
        await ctx.reply("Ошибка: перевод не введен или слово не выбрано.");
        return;
      }

      try {
        // Отправка перевода через API
        const apiUrl = process.env.api_url;

        if (ctx.from) {
          if (ctx.from.id) {
            const getuser = await fetch(
              `${apiUrl}/telegram/user/is-exists/${ctx.from.id}`,
              {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.admintoken}`,
                },
              }
            );

            const fetchuserResult = (await getuser.json()) as getUserResponse;
            // Подготовка тела запроса
            const requestBody = {
              word_id: wordId,
              translate_language: ctx.wizard.state.language || "unknown", // Язык перевода
              translate: translation, // Введенный перевод
              dialect: ctx.wizard.state.selectedDialect,
              normalized_text: translation.trim().toLowerCase() || "",
              telegram_user_id: fetchuserResult.user._id,
            };

            const response = await fetch(
              `${apiUrl}/vocabulary/suggest-translate`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.admintoken}`,
                },
                body: JSON.stringify(requestBody),
              }
            );

            if (response.ok) {
              await ctx.reply(
                `Ваш перевод для слова успешно отправлен: ${translation}`
              );
            } else {
              await ctx.reply(
                `Ошибка при отправке перевода`
              );
            }

            ctx.wizard.state.language = "";

            // Возврат к началу после успешного перевода
            ctx.scene.enter("dictionary-wizard");
          } else {
            // Возврат к началу если ID не найден
            ctx.scene.enter("dictionary-wizard");
          }
        } else {
          // Возврат к началу если ctx.from нет
          ctx.scene.enter("dictionary-wizard");
        }
      } catch (error) {
        console.error("Ошибка при отправке перевода:", error);
        await ctx.reply("Произошла ошибка при отправке вашего перевода.");
      }
    } else if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const callbackData = (ctx.callbackQuery as any).data;

      // Обрабатываем выбор слова, используя _id
      if (callbackData.startsWith("select_dialect_for_suggest_translate_")) {
        const selectedDialect = callbackData.split("_").pop(); // Извлекаем выбранный диалект
        // Сохраняем диалект в состоянии
        ctx.wizard.state.selectedDialect = selectedDialect;

        // Получаем предыдущее сообщение, мне лень править типы
        // @ts-ignore
        const message = ctx.update.callback_query.message;

        const dialectButtons = await renderKeyboardDialects(
          ctx,
          selectedDialect
        );

        console.log(dialectButtons);
        // Отправляем клавиатуру с диалектами
        await sendOrEditMessage(
          ctx,
          message.text,
          Markup.inlineKeyboard([
            ...dialectButtons,
            [Markup.button.callback("Назад", "back")],
          ])
        );
      }

      if (callbackData === "back") {
        await fetchPaginatedWords(ctx);
      }

      ctx.answerCbQuery();
    } else {
      await ctx.reply("Пожалуйста, введите перевод для выбранного слова.");
    }
  } else {
    return next();
  }
});

const dictionaryKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Найти слово", "select_language")],
  // [
  //   Markup.button.callback("Русский", "select_russian"),
  //   Markup.button.callback("Бурятский", "select_buryat"),
  // ],
  [Markup.button.callback("Модерация", "consider_suggested_words")], // Новая кнопка
  [Markup.button.callback("Предложить слово", "suggest_word")],
  [Markup.button.callback("Предложить переводы", "suggest_translate")], // Новая кнопка
  [Markup.button.callback("Назад", "home")],
]);

const link = "https://t.me/bur_live";
const how_to_use_dict =
  "https://telegra.ph/Kak-vospolzovatsya-slovarem-httpstmeburlive-bot-09-08";
const hot_to_vote = "https://telegra.ph/Kak-progolosovat-za-perevod-09-08";
const how_to_suggest_translate =
  "https://telegra.ph/Kak-dobavit-perevoda-k-slovu-09-08";
// Убираем `ctx.wizard.next()` из `enter`
dictionaryWizard.enter(async (ctx) => {
  sendOrEditMessage(
    ctx,
    `<b>Словарь</b> \n\nВыберите раздел для начала работ\n\n<i><a href='${how_to_use_dict}'>Как воспользоваться словарем?</a>\n<a href='${hot_to_vote}'>Как проголосовать за перевод?</a>\n<a href='${link}'>Как предложить слово на перевод?</a>\n<a href='${how_to_suggest_translate}'>Как добавить перевод к слову?</a></i>`,
    dictionaryKeyboard
  );
});

const messageContentSelectRussianForTranslate = `<b>Словарь — Найти слово 🔎\n\n</b><i>Введите слово для перевода с русского:</i>`;
const messageContentSelectBuryatForTranslate = `<b>Словарь — Найти слово 🔎\n\n</b><i>Введите слово для перевода с бурятского:</i>`;

// Обработчики выбора языка
dictionaryWizard.action("select_russian", async (ctx) => {
  ctx.wizard.state.language = "russian";
  await sendOrEditMessage(ctx, messageContentSelectRussianForTranslate);
  return ctx.wizard.selectStep(1); // Переход к шагу 1
});

// Обработчики выбора языка
dictionaryWizard.action("select_buryat", async (ctx) => {
  ctx.wizard.state.language = "buryat";
  await sendOrEditMessage(ctx, messageContentSelectBuryatForTranslate);
  return ctx.wizard.selectStep(1); // Переход к шагу 1
});

// Обработчик для предложения перевода к словам
dictionaryWizard.action("suggest_translate", async (ctx) => {
  // Начальный запрос на получение доступных слов для перевода
  await fetchPaginatedWords(ctx, 1, 10);
});

interface fetchPaginatedWordsResponse {
  message: string;
  words: IWordModel[];
  totalWords: number;
  currentPage: number;
  totalPages: number;
}

// Функция для отправки запроса к API и отображения доступных слов для перевода
async function fetchPaginatedWords(
  ctx: MyContext,
  page = 1,
  limit = 10,
  reply = false
) {
  try {
    const apiUrl = process.env.api_url;
    const response = await fetch(
      `${apiUrl}/vocabulary/paginated?page=${page}&limit=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.admintoken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data = (await response.json()) as fetchPaginatedWordsResponse;

    if (response.ok) {
      const { words, totalWords } = data;

      if (totalWords === 0) {
        ctx.answerCbQuery(`Предложенных слов нет`)
        return
      }

      // Формируем сообщение с результатами
      const resultMessage = await createResultMessage(
        words,
        totalWords,
        page,
        limit
      );
      // Формируем клавиатуру, используя word._id
      const selectionButtons = words.map(
        (word: IWordModel, index: number) =>
          Markup.button.callback(`${index + 1}`, `select_word_${word._id}`)
      );

      // Разбиваем кнопки по два ряда (по 5 кнопок на ряд)
      const rows = [];
      for (let i = 0; i < selectionButtons.length; i += 5) {
        rows.push(selectionButtons.slice(i, i + 5));
      }

      // Добавляем пагинацию в отдельный ряд
      const paginationButtons = [
        Markup.button.callback("⬅️", "prev_page"),
        Markup.button.callback("Назад", "back"),
        Markup.button.callback("➡️", "next_page"),
      ];

      const selectionKeyboard = Markup.inlineKeyboard([
        ...rows,
        paginationButtons,
      ]);

      ctx.session.page = page;

      await sendOrEditMessage(ctx, resultMessage, selectionKeyboard, reply);
      ctx.wizard.selectStep(4); // Переход на шаг 4
    } else {
      await ctx.reply("Ошибка при получении данных.");
    }
  } catch (error) {
    console.error(error);
    await ctx.reply("Произошла ошибка при запросе.");
  }
}

// Обработчики для выбора слова по индексу для перевода
for (let i = 0; i < 10; i++) {
  dictionaryWizard.action(`select_word_for_translation_${i}`, async (ctx) => {
    const page = ctx.session.page || 1;
    const limit = 10;

    // Получаем данные заново, чтобы выбрать правильный элемент
    const apiUrl = process.env.api_url;
    const response: any = await fetch(
      `${apiUrl}/vocabulary/get-words-for-translation?page=${page}&limit=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.admintoken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data = await response.json();

    if (response.ok) {
      const selectedWord = data.words[i]; // Выбираем нужное слово по индексу

      // Сохраняем _id выбранного слова в сессии
      ctx.wizard.state.selectedWordId = selectedWord._id;

      // Просим пользователя ввести перевод для выбранного слова
      await ctx.reply(`Введите перевод для слова: ${selectedWord.text}`);

      // Переходим на следующий шаг для ввода перевода
      ctx.wizard.selectStep(5);

      // Обработчик для получения перевода от пользователя
      dictionaryWizard.on("text", async (ctx) => {
        const translationInput = ctx.message?.text;
        if (!translationInput) {
          await ctx.reply("Пожалуйста, введите корректный перевод.");
          return;
        }

        // Отправляем перевод на сервер
        const requestBody = {
          word_id: selectedWord._id,
          translation: translationInput,
          telegram_user_id: ctx.from?.id,
        };

        const response = await fetch(`${apiUrl}/vocabulary/suggest-translate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.admintoken}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          await ctx.reply(
            `Ваш перевод для слова "${selectedWord.text}" успешно предложен: ${translationInput}`
          );
        } else {
          await ctx.reply(
            `Ошибка при предложении перевода`
          );
        }

        // Возвращаемся к главной сцене после обработки перевода
        return ctx.scene.enter("dictionary-wizard");
      });
    } else {
      await ctx.reply("Ошибка при получении данных.");
    }
  });
}

const suggesWordHandlerMessageContent =
  "<b>Предложение слова — Выбор языка ✍️</b>\n\nУкажите язык, на котором вы будете добавлять слово/слова для дальнейшего перевода нашим сообществом";
const suggesWordHandlerSelectedLanguageBuryat =
  "<b>Предложение слова — Выбор диалекта ✍️</b>\n\nУкажите диалект, на котором хотите добавить слово для дальнейшего перевода нашим сообществом";

// Обработчик для предложения слова
dictionaryWizard.action("suggest_word", async (ctx) => {
  const languageSelectionKeyboard = Markup.inlineKeyboard([
    [
      Markup.button.callback("Русский", "suggest_russian"),
      Markup.button.callback("Бурятский", "suggest_buryat"),
    ],
    [Markup.button.callback("Назад", "back")],
  ]);

  await sendOrEditMessage(
    ctx,
    suggesWordHandlerMessageContent,
    languageSelectionKeyboard
  );
});

// Обработчик для предложения слова на русском языке
dictionaryWizard.action("suggest_russian", async (ctx) => {
  ctx.wizard.state.language = "russian";
  await sendOrEditMessage(
    ctx,
    "Введите слово или фразу, которую хотите отправить на перевод с русского:"
  );
  return ctx.wizard.selectStep(2); // Переход к шагу 2
});

// Обработчик для предложения слова на бурятском языке с диалектами
dictionaryWizard.action("suggest_buryat", async (ctx) => {
  ctx.wizard.state.language = "buryat";

  // Если диалект уже выбран, получаем его из состояния, иначе используем первый по умолчанию
  const selectedDialect = ctx.wizard.state.selectedDialect || dialects[0].value;

  // Формируем клавиатуру с диалектами, где выбранный помечен значком ✅
  const dialectButtons = dialects.map((dialect) =>
    Markup.button.callback(
      `${selectedDialect === dialect.value ? "✅ " : ""}${dialect.label}`,
      `select_dialect_for_suggest_translate_${dialect.value}`
    )
  );

  // Группируем кнопки по две в строке
  const groupedDialectButtons = [];
  for (let i = 0; i < dialectButtons.length; i += 2) {
    groupedDialectButtons.push(dialectButtons.slice(i, i + 2));
  }

  // Добавляем кнопку "Далее" в отдельную строку
  groupedDialectButtons.push([
    Markup.button.callback("Далее", "continue_with_dialect"),
  ]);

  // Отправляем клавиатуру с диалектами
  await sendOrEditMessage(
    ctx,
    suggesWordHandlerSelectedLanguageBuryat,
    Markup.inlineKeyboard(groupedDialectButtons)
  );
});

// Обработчик для выбора диалекта
dialects.forEach((dialect) => {
  dictionaryWizard.action(
    `select_dialect_for_suggest_translate_${dialect.value}`,
    async (ctx) => {
      // Обновляем выбранный диалект в состоянии
      ctx.wizard.state.selectedDialect = dialect.value;

      // Повторно отправляем сообщение с обновлённой клавиатурой
      const selectedDialect = ctx.wizard.state.selectedDialect;

      // Формируем кнопки с диалектами, где выбранный помечен значком ✅
      const dialectButtons = dialects.map((dialect) =>
        Markup.button.callback(
          `${selectedDialect === dialect.value ? "✅ " : ""}${dialect.label}`,
          `select_dialect_for_suggest_translate_${dialect.value}`
        )
      );

      // Группируем кнопки по две в строке
      const groupedDialectButtons = [];
      for (let i = 0; i < dialectButtons.length; i += 2) {
        groupedDialectButtons.push(dialectButtons.slice(i, i + 2));
      }

      // Добавляем кнопку "Далее" в отдельную строку
      groupedDialectButtons.push([
        Markup.button.callback("Далее", "continue_with_dialect"),
      ]);

      // Отправляем обновлённое сообщение с клавиатурой
      await sendOrEditMessage(
        ctx,
        suggesWordHandlerSelectedLanguageBuryat,
        Markup.inlineKeyboard(groupedDialectButtons)
      );
    }
  );
});

// Обработчик для продолжения после выбора диалекта
dictionaryWizard.action("continue_with_dialect", async (ctx) => {
  const selectedDialect = ctx.wizard.state.selectedDialect || dialects[0].value;

  let message = `<b>Предложение слова — Ввод слова или фразы ✍️</b>\n\n`;

  message += `Вы выбрали язык: <b>Бурятский</b>\n`;
  // Проверяем, выбрал ли пользователь "Не знаю"
  message +=
    selectedDialect === "unknown"
      ? "<b>Вы не выбрали диалект</b>"
      : `Вы выбрали диалект: <b>${
          dialects.find((d) => d.value === selectedDialect)?.label
        } </b>\n\n<i>Введите слово или фразу:</i>`;

  // const actionKeyboard = Markup.inlineKeyboard([
  // Markup.button.callback("Назад", "suggest_buryat"),
  // ]);

  await sendOrEditMessage(ctx, message);

  return ctx.wizard.selectStep(2); // Переход к следующему шагу для ввода слова
});

dictionaryWizard.action("select_language", async (ctx) => {
  try {
    let message = `<b>Словарь — Найти слово 🔎\n\n</b>`;
    message += `<i>Выберите язык, на котором хотите найти слово</i>`;
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback("Русский", "select_russian"),
        Markup.button.callback("Бурятский", "select_buryat"),
      ],
      [Markup.button.callback("Назад", "back")],
    ]);
    await sendOrEditMessage(ctx, message, keyboard);
  } catch (error) {
    console.log(error);
  }
});
dictionaryWizard.action("home", async (ctx) => {
  console.log(ctx.wizard.state.language);
  ctx.scene.enter("home");
});

dictionaryWizard.action("back", async (ctx) => {
  ctx.scene.enter("dictionary-wizard");
});

// Обработчик для кнопки "Добавить переводы"
dictionaryWizard.action("consider_suggested_words", async (ctx) => {
  const page = ctx.session.page || 1; // Инициализируем page если он еще не определён
  const limit = 10; // Количество элементов на страницу

  await fetchWordsOnApproval(ctx, page, limit);
});

// Обработчики для выбора слова по индексу
for (let i = 0; i < 10; i++) {
  dictionaryWizard.action(`select_word_${i}`, async (ctx) => {
    const page = ctx.session.page || 1;
    const limit = 10;

    // Получаем данные заново, чтобы выбрать правильный элемент
    const apiUrl = process.env.api_url;
    const response = await fetch(
      `${apiUrl}/vocabulary/approval?page=${page}&limit=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.admintoken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data: any = await response.json();

    if (response.ok) {
      const selectedWord = data.words[i]; // Выбираем нужное слово по индексу

      // Сохраняем _id выбранного слова в сессии
      ctx.wizard.state.selectedWordId = selectedWord._id;

      // Переход на следующий шаг и предоставление кнопок действий
      await ctx.editMessageText(
        `Вы выбрали слово для рассмотрения: ${selectedWord.text} (${selectedWord.language})`
      );

      const actionKeyboard = Markup.inlineKeyboard([
        Markup.button.callback("Принять", "approve_word"),
        Markup.button.callback("Отклонить", "reject_word"),
        // Ошибся :)
        Markup.button.callback("Назад", "skip_word"),
      ]);

      await ctx.reply("Что вы хотите сделать с этим словом?", actionKeyboard);
    } else {
      await ctx.reply("Ошибка при получении данных.");
    }
  });
}

dictionaryWizard.action("skip_word", async (ctx) => {
  const currentPage = ctx.session.page ? ctx.session.page : 1;
  await fetchWordsOnApproval(ctx, currentPage);
});
dictionaryWizard.action("approve_word", async (ctx) => {
  const wordId = ctx.wizard.state.selectedWordId;
  const userId = ctx.from?.id;

  if (!wordId || !userId) {
    await ctx.reply("Ошибка: отсутствуют данные для принятия слова.");
    return;
  }

  try {
    const apiUrl = process.env.api_url;
    const response = await fetch(`${apiUrl}/vocabulary/accept-suggested-word`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.admintoken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        suggestedWordId: wordId,
        telegram_user_id: userId,
      }),
    });

    if (response.ok) {
      await ctx.editMessageText("Слово успешно принято и добавлено в словарь.");
      const page = ctx.session.page || 1; // Инициализируем page если он еще не определён
      const limit = 10; // Количество элементов на страницу

      await fetchWordsOnApproval(ctx, page, limit, true);
    } else {
      console.log(await response.json())
      await ctx.reply(`Ошибка при принятии слова`);
    }
  } catch (error) {
    console.error("Ошибка при принятии слова:", error);
    await ctx.reply("Произошла ошибка при принятии слова.");
  }

  return ctx.wizard.selectStep(2); // Возвращаемся к просмотру предложенных слов
});
dictionaryWizard.action("reject_word", async (ctx) => {
  const wordId = ctx.wizard.state.selectedWordId; // ID выбранного слова
  const userId = ctx.from?.id; // ID пользователя в Телеграм

  if (!wordId || !userId) {
    await ctx.reply("Ошибка: отсутствуют данные для отклонения слова.");
    return ctx.wizard.selectStep(2); // Возвращаемся к предыдущему шагу
  }

  try {
    const apiUrl = process.env.api_url; // URL вашего API
    const response = await fetch(
      `${apiUrl}/vocabulary/decline-suggested-word`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.admintoken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          suggestedWordId: wordId, // ID отклоняемого слова
          telegram_user_id: userId, // ID текущего пользователя
        }),
      }
    );

    if (response.ok) {
      await ctx.editMessageText(
        `Слово успешно отклонено и добавлено в архив отклонённых слов.`
      );
      const page = ctx.session.page || 1; // Инициализируем page если он еще не определён
      const limit = 10; // Количество элементов на страницу

      await fetchWordsOnApproval(ctx, page, limit, true);
    } else {
      await ctx.reply(`Ошибка при отклонении слова`);
    }
  } catch (error) {
    console.error("Ошибка при отклонении слова:", error);
    await ctx.reply("Произошла ошибка при отклонении слова.");
  }

  return ctx.wizard.selectStep(2); // Возвращаемся к просмотру предложенных слов
});

// Обработчик для кнопки "⬅️" (предыдущая страница)
dictionaryWizard.action("prev_page", async (ctx) => {
  try {
    // Если значение страницы не определено, инициализируем его как 1
    const currentPage = ctx.session.page ? ctx.session.page : 1;

    // Переход на предыдущую страницу, минимальное значение — 1
    const prevPage = Math.max(1, currentPage - 1);

    // Обновляем значение текущей страницы в сессии
    ctx.session.page = prevPage;

    if (currentPage === 1) {
      ctx.answerCbQuery();
      return false;
    }

    // Запрашиваем данные для предыдущей страницы
    return await fetchWordsOnApproval(ctx, prevPage, 10);
  } catch (error) {
    return ctx.reply(`Ошибка при обработке action`)
    
  }
});

dictionaryWizard.action("next_page", async (ctx) => {
  try {
    // Получаем данные о текущей странице из сессии
    const currentPage = ctx.session.page ? ctx.session.page : 1;
    const limit = 10;

    // Запрашиваем данные для текущей страницы, чтобы узнать общее количество слов
    const apiUrl = process.env.api_url;
    const response = await fetch(
      `${apiUrl}/vocabulary/approval?page=${currentPage}&limit=${limit}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.admintoken}`,
          "Content-Type": "application/json",
        },
      }
    );
    const data: any = await response.json();

    if (response.ok) {
      const totalWords = data.total_count; // Общее количество слов
      const totalPages = Math.ceil(totalWords / limit); // Общее количество страниц

      // Проверяем, находится ли пользователь на последней странице
      if (currentPage >= totalPages) {
        // Сообщаем пользователю, что он на последней странице
        await ctx.answerCbQuery("Вы уже на последней странице.");
        return false;
      }

      // Если это не последняя страница, переходим на следующую
      const nextPage = currentPage + 1;
      ctx.session.page = nextPage;

      // Запрашиваем данные для следующей страницы
      return await fetchWordsOnApproval(ctx, nextPage, limit);
    } else {
      return await ctx.reply("Ошибка при получении данных.");
    }
  } catch (error) {
    return ctx.answerCbQuery(`Ошибка при обработке запроса`)
  }
});

async function renderKeyboardDialects(_ctx: MyContext, selectedDialect: string) {
  try {
    // Формируем клавиатуру с диалектами, где выбранный помечен значком ✅
    const dialectButtons = dialects.map((dialect) => [
      Markup.button.callback(
        `${selectedDialect === dialect.value ? "✅ " : ""}${dialect.label}`,
        `select_dialect_for_suggest_translate_${dialect.value}`
      ),
    ]);

    return dialectButtons;
  } catch (error) {
    console.log(error);
    return [];
  }
}

export default dictionaryWizard;
