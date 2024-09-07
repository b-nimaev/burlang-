import { Composer, Scenes, Markup } from "telegraf";
import { MyContext } from "../types/MyContext";
import { sendOrEditMessage } from "..";
import { ISuggestedWordModel } from "../models/SuggestedWordModel";

// Описываем тип для состояния Wizard-сцены
interface WizardState {
  language?: string;
  suggestion?: boolean;
  selectedWordId?: string; // Добавляем свойство для хранения _id выбранного слова
  selectedDialect?: string
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
function createResultMessage(words: ISuggestedWordModel[], total_count: number, page: number, limit: number) {
  let resultMessage = `Результаты ${page * limit - limit + 1}-${Math.min(page * limit, total_count)} из ${total_count}:\n\n`;
  
  words.forEach((word, index) => {
    const languageFullName = languageNames[word.language] || word.language;
    const dialectFullName = word.dialect ? dialectNames[word.dialect] || word.dialect : "";
    
    resultMessage += `${index + 1}. ${word.text} – <i>${languageFullName}${dialectFullName ? `, ${dialectFullName}` : ""}</i>\n`;
  });

  return resultMessage;
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
      `${apiUrl}/vocabulary/get-words-on-approval?page=${page}&limit=${limit}`,
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
      const { words, total_count } = data;

      // Формируем результат и клавиатуру
      const resultMessage = createResultMessage(
        words,
        total_count,
        page,
        limit
      );

      const selectionButtons = [
        words
          .slice(0, 5)
          .map((word: ISuggestedWordModel, index: number) =>
            Markup.button.callback(`${index + 1}`, `select_word_${index}`)
          ),
        words
          .slice(5, 10)
          .map((word: ISuggestedWordModel, index: number) =>
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

      return ctx.scene.enter("dictionary-wizard"); // Возврат к сцене после обработки
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
              id: userId,
              dialect: ctx.wizard.state.selectedDialect || "khori",
            };

            const response = await postRequest(
              `${apiUrl}/vocabulary/suggest-word`,
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

          return ctx.scene.enter("dictionary-wizard"); // Возврат к сцене
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

        if (response.ok) {
          await ctx.editMessageText(
            action === "approve_word"
              ? "Слово успешно принято."
              : "Слово успешно отклонено."
          );
        } else {
          const errorData = await response.json();
          await ctx.reply(`Ошибка: ${errorData.message}`);
        }
      } else if (action === "skip_word") {
        await ctx.reply("Слово пропущено.");
        return ctx.scene.enter("dictionary-wizard");
      }

      await ctx.answerCbQuery();
    }
  }
);

// Шаг 4: Обработка выбора слова для перевода и навигации
dictionaryWizard.use(async (ctx, next) => {
  if (ctx.wizard.cursor === 4) {
    // Проверка, что это callbackQuery с полем data
    if (ctx.callbackQuery && "data" in ctx.callbackQuery) {
      const callbackData = (ctx.callbackQuery as any).data; // Casting to 'any' to access 'data'
      // Обработка выбора слова для перевода
      if (callbackData.startsWith("select_word_")) {
        const selectedWordIndex = parseInt(
          callbackData.split("_").pop() || "0",
          10
        );
        const page = ctx.session.page || 1;
        const limit = 10;

        // Получаем данные о словах для перевода заново
        const apiUrl = process.env.api_url;
        const response = await fetch(
          `${apiUrl}/vocabulary/get-words-paginated?page=${page}&limit=${limit}`,
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
          const selectedWord = data.words[selectedWordIndex]; // Выбираем нужное слово

          // Сохраняем _id выбранного слова в состоянии
          ctx.wizard.state.selectedWordId = selectedWord._id;

          // Просим пользователя ввести перевод для выбранного слова
          await sendOrEditMessage(
            ctx,
            `Введите перевод для слова: ${selectedWord.text}`
          );

          // Переходим на следующий шаг для ввода перевода
          ctx.wizard.selectStep(5);
        } else {
          await ctx.reply("Ошибка при получении данных.");
        }
      }

      // Обработка пагинации для кнопки "⬅️" (предыдущая страница)
      if (callbackData === "prev_page") {
        const currentPage = ctx.session.page || 1;
        if (currentPage > 1) {
          const prevPage = currentPage - 1;

          // Обновляем сессию и запрашиваем данные для предыдущей страницы
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

        // Получаем данные о текущей странице, чтобы узнать общее количество слов
        const apiUrl = process.env.api_url;
        const response = await fetch(
          `${apiUrl}/vocabulary/get-words-paginated?page=${currentPage}&limit=${limit}`,
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
          const totalWords = data.totalWords;
          const totalPages = Math.ceil(totalWords / limit);

          if (currentPage < totalPages) {
            const nextPage = currentPage + 1;

            // Обновляем сессию и запрашиваем данные для следующей страницы
            ctx.session.page = nextPage;
            await fetchPaginatedWords(ctx, nextPage, 10);
          } else {
            await ctx.answerCbQuery("Это последняя страница.");
          }
        } else {
          await ctx.reply("Ошибка при получении данных.");
        }
      }

      // Подтверждаем callback query
      await ctx.answerCbQuery();
    }
  } else {
    return next();
  }
});

const dictionaryKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("Русский", "select_russian"),
    Markup.button.callback("Бурятский", "select_buryat"),
  ],
  [Markup.button.callback("Модерация", "consider_suggested_words")], // Новая кнопка
  [Markup.button.callback("Предложить слово", "suggest_word")],
  [Markup.button.callback("Предложить переводы", "suggest_translate")], // Новая кнопка
  [Markup.button.callback("Назад", "home")],
]);

// Убираем `ctx.wizard.next()` из `enter`
dictionaryWizard.enter(async (ctx) => {
  sendOrEditMessage(
    ctx,
    "<b>Словарь</b> \n\nВыберите язык для перевода или предложите слово для дальнейшего перевода нашим сообществом",
    dictionaryKeyboard
  );
});

// Обработчики выбора языка
dictionaryWizard.action("select_russian", async (ctx) => {
  ctx.wizard.state.language = "russian";
  await sendOrEditMessage(ctx, "Введите слово для перевода с русского:");
  return ctx.wizard.selectStep(1); // Переход к шагу 1
});

// Обработчики выбора языка
dictionaryWizard.action("select_buryat", async (ctx) => {
  ctx.wizard.state.language = "buryat";
  await sendOrEditMessage(ctx, "Введите слово для перевода с бурятского:");
  return ctx.wizard.selectStep(1); // Переход к шагу 1
});

// Обработчик для предложения перевода к словам 
dictionaryWizard.action("suggest_translate", async (ctx) => {
  // Начальный запрос на получение доступных слов для перевода
  await fetchPaginatedWords(ctx, 1, 10);
});

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
      `${apiUrl}/vocabulary/get-words-paginated?page=${page}&limit=${limit}`,
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
      const { words, totalWords } = data;

      // Формируем результат и клавиатуру
      const resultMessage = createResultMessage(words, totalWords, page, limit);

      const selectionButtons = [
        words
          .slice(0, 5)
          .map((_: ISuggestedWordModel, index: number) =>
            Markup.button.callback(`${index + 1}`, `select_word_${index}`)
          ),
        words
          .slice(5, 10)
          .map((_: ISuggestedWordModel, index: number) =>
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
      ctx.wizard.selectStep(4);
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
    const response = await fetch(`${apiUrl}/vocabulary/get-words-for-translation?page=${page}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.admintoken}`,
        'Content-Type': 'application/json'
      }
    });
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
          await ctx.reply(`Ваш перевод для слова "${selectedWord.text}" успешно предложен: ${translationInput}`);
        } else {
          const errorData = await response.json();
          await ctx.reply(`Ошибка при предложении перевода: ${errorData.message}`);
        }

        // Возвращаемся к главной сцене после обработки перевода
        return ctx.scene.enter("dictionary-wizard");
      });
    } else {
      await ctx.reply("Ошибка при получении данных.");
    }
  });
}

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
    "Выберите язык, на котором хотите предложить слово для корпуса:",
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
  const dialectButtons = dialects.map((dialect) => [
    Markup.button.callback(
      `${selectedDialect === dialect.value ? "✅ " : ""}${dialect.label}`,
      `select_dialect_${dialect.value}`
    ),
  ]);

  // Отправляем клавиатуру с диалектами
  await sendOrEditMessage(
    ctx,
    "Выберите диалект, на котором хотите предложить слово для корпуса:",
    Markup.inlineKeyboard([...dialectButtons, [Markup.button.callback("Далее", "continue_with_dialect")]])
  );
});

// Обработчик для выбора диалекта
dialects.forEach((dialect) => {
  dictionaryWizard.action(`select_dialect_${dialect.value}`, async (ctx) => {
    // Обновляем выбранный диалект в состоянии
    ctx.wizard.state.selectedDialect = dialect.value;

    // Повторно отправляем сообщение с обновлённой клавиатурой
    const selectedDialect = ctx.wizard.state.selectedDialect;

    const dialectButtons = dialects.map((dialect) => [
      Markup.button.callback(
        `${selectedDialect === dialect.value ? "✅ " : ""}${dialect.label}`,
        `select_dialect_${dialect.value}`
      ),
    ]);

    await sendOrEditMessage(
      ctx,
      "Выберите диалект, на котором хотите предложить слово для корпуса:",
      Markup.inlineKeyboard([...dialectButtons, [Markup.button.callback("Далее", "continue_with_dialect")]])
    );
  });
});


// Обработчик для продолжения после выбора диалекта
dictionaryWizard.action("continue_with_dialect", async (ctx) => {
  const selectedDialect = ctx.wizard.state.selectedDialect || dialects[0].value;

  // Проверяем, выбрал ли пользователь "Не знаю"
  const message = selectedDialect === "unknown"
    ? "Вы выбрали: \"Не знаю\". Введите слово или фразу, диалект будет определён позже."
    : `Вы выбрали диалект: ${dialects.find((d) => d.value === selectedDialect)?.label}. Введите слово или фразу:`;

  await sendOrEditMessage(ctx, message);

  return ctx.wizard.selectStep(2); // Переход к следующему шагу для ввода слова
});

dictionaryWizard.action("home", async (ctx) => {
  console.log(ctx.wizard.state.language);
  ctx.scene.enter("home");
});

dictionaryWizard.action("back", async (ctx) => {
    ctx.scene.enter("dictionary-wizard");
})

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
    const response = await fetch(`${apiUrl}/vocabulary/get-words-on-approval?page=${page}&limit=${limit}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.admintoken}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();

    if (response.ok) {
      const selectedWord = data.words[i]; // Выбираем нужное слово по индексу

      // Сохраняем _id выбранного слова в сессии
      ctx.wizard.state.selectedWordId = selectedWord._id;

      // Переход на следующий шаг и предоставление кнопок действий
      await ctx.editMessageText(`Вы выбрали слово для рассмотрения: ${selectedWord.text} (${selectedWord.language})`);

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
  await fetchWordsOnApproval(ctx, currentPage)
})
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
      const errorData = await response.json();
      await ctx.reply(`Ошибка при принятии слова: ${errorData.message}`);
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
      const errorData = await response.json();
      await ctx.reply(`Ошибка при отклонении слова: ${errorData.message}`);
    }
  } catch (error) {
    console.error("Ошибка при отклонении слова:", error);
    await ctx.reply("Произошла ошибка при отклонении слова.");
  }

  return ctx.wizard.selectStep(2); // Возвращаемся к просмотру предложенных слов
});

// Обработчик для кнопки "⬅️" (предыдущая страница)
dictionaryWizard.action("prev_page", async (ctx) => {
  // Если значение страницы не определено, инициализируем его как 1
  const currentPage = ctx.session.page ? ctx.session.page : 1;

  // Переход на предыдущую страницу, минимальное значение — 1
  const prevPage = Math.max(1, currentPage - 1);

  // Обновляем значение текущей страницы в сессии
  ctx.session.page = prevPage;

  if (currentPage === 1) {
    ctx.answerCbQuery()
    return false
  }

  // Запрашиваем данные для предыдущей страницы
  await fetchWordsOnApproval(ctx, prevPage, 10);
});

dictionaryWizard.action("next_page", async (ctx) => {
  // Получаем данные о текущей странице из сессии
  const currentPage = ctx.session.page ? ctx.session.page : 1;
  const limit = 10;

  // Запрашиваем данные для текущей страницы, чтобы узнать общее количество слов
  const apiUrl = process.env.api_url;
  const response = await fetch(
    `${apiUrl}/vocabulary/get-words-on-approval?page=${currentPage}&limit=${limit}`,
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
    await fetchWordsOnApproval(ctx, nextPage, limit);
  } else {
    await ctx.reply("Ошибка при получении данных.");
  }
});


export default dictionaryWizard;
