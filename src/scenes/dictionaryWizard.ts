import { Composer, Scenes, Markup } from "telegraf";
import { MyContext } from "../types/MyContext";
import { sendOrEditMessage } from "..";
import { ISuggestedWordModel } from "../models/SuggestedWordModel";

// Описываем тип для состояния Wizard-сцены
interface WizardState {
  language?: string;
  suggestion?: boolean;
}

// Обработчик для начальной сцены
const handler = new Composer<MyContext>();

// Сцена "Словарь"
const dictionaryWizard = new Scenes.WizardScene<
  MyContext & { wizard: { state: WizardState } }
>(
  "dictionary-wizard",
  handler,

  // Шаг 1: Получение userInput от пользователя и перевод слова
  async (ctx) => {
    if (ctx.message && "text" in ctx.message) {
      const userInput = ctx.message.text;

      // Логика обращения к API для перевода
      const language = ctx.wizard.state.language;
      // const translation = await yourApiTranslateFunction(userInput, language); // вызов API для перевода

      await ctx.reply(`Перевод для "${userInput}" с ${language}: ${userInput}`);
      return ctx.scene.enter("dictionary-wizard"); // Переход на главную после обработки
    } else {
      await ctx.reply("Пожалуйста, введите текст.");
    }
  },

  // Шаг 2: Обработка введённого слова и отправка на API
  async (ctx) => {
    if (ctx.message && "text" in ctx.message) {
      const userInput = ctx.message.text;
      const language = ctx.wizard.state.language || "не указан";

      if (ctx.from) {
        // Проверка на наличие ctx.from
        const userId = ctx.from.id; // ID телеграмм пользователя

        if (userInput) {
          try {
            const apiUrl = process.env.api_url; // URL API из .env
            const adminToken = process.env.admintoken; // Bearer токен из .env

            // Тело запроса
            const requestBody = {
              text: userInput,
              language: language === "russian" ? "russian" : "buryat",
              id: userId,
            };

            // Отправка POST-запроса
            const response = await fetch(`${apiUrl}/vocabulary/suggest-word`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${adminToken}`,
              },
              body: JSON.stringify(requestBody),
            });

            if (response.ok) {
              await ctx.reply(
                `Ваше предложение успешно отправлено: ${userInput}`
              );
            } else {
              await ctx.reply(
                `Ошибка при отправке предложения: ${response.statusText}`
              );
            }
          } catch (error) {
            console.error("Ошибка при запросе:", error);
            await ctx.reply(
              "Произошла ошибка при отправке вашего предложения."
            );
          }

          return ctx.scene.enter("dictionary-wizard"); // Переход на главную после обработки
        } else {
          return ctx.scene.enter("home");
        }
      } else {
        await ctx.reply("Не удалось определить пользователя.");
      }
    } else {
      await ctx.reply("Пожалуйста, введите текстовое сообщение.");
    }
  }
);

const dictionaryKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback("Русский", "select_russian"),
    Markup.button.callback("Бурятский", "select_buryat"),
  ],
  [Markup.button.callback("Предложить слово", "suggest_word")],
  [Markup.button.callback("Добавить переводы", "add_translations")], // Новая кнопка
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

// Обработчик для предложения слова на бурятском языке
dictionaryWizard.action("suggest_buryat", async (ctx) => {
  ctx.wizard.state.language = "buryat";
  await sendOrEditMessage(
    ctx,
    "Введите слово или фразу, которую хотите отправить на перевод с бурятского:"
  );
  return ctx.wizard.selectStep(2); // Переход к шагу 2
});

dictionaryWizard.action("home", async (ctx) => {
  console.log(ctx.wizard.state.language);
  ctx.scene.enter("home");
});

dictionaryWizard.action("back", async (ctx) => {
    ctx.scene.enter("dictionary-wizard");
})

// Обработчик для кнопки "Добавить переводы"
dictionaryWizard.action("add_translations", async (ctx) => {
  const page = ctx.session.page || 1; // Инициализируем page если он еще не определён
  const limit = 10; // Количество элементов на страницу

  await fetchWordsOnApproval(ctx, page, limit);
});

// Функция для отправки запроса к API и отображения результата
async function fetchWordsOnApproval(ctx: MyContext, page = 1, limit = 10) {
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

      // Формируем строку с результатами
      let resultMessage = `Результаты ${(page * limit) - 10 + 1}-${Math.min(
        page * limit,
        total_count
      )} из ${total_count}:\n\n`;
      words.forEach((word: ISuggestedWordModel, index: number) => {
        resultMessage += `${index + 1}. ${word.text} – ${word.language}\n`;
      });

      // Создаем кнопки в два горизонтальных ряда (по 5 кнопок на ряд)
      const selectionButtons = [
        words
          .slice(0, 5)
          .map((word: ISuggestedWordModel, index: number) =>
            Markup.button.callback(`${index + 1}`, `select_word_${index}`)
          ), // Первый ряд (1-5)
        words
          .slice(5, 10)
          .map((word: ISuggestedWordModel, index: number) =>
            Markup.button.callback(`${index + 6}`, `select_word_${index + 5}`)
          ), // Второй ряд (6-10)
      ];

      // Добавляем кнопки для пагинации
      const paginationButtons = [
        Markup.button.callback("⬅️", "prev_page"),
        Markup.button.callback("Назад", "back"),
        Markup.button.callback("➡️", "next_page"),
      ];

      const selectionKeyboard = Markup.inlineKeyboard([
        ...selectionButtons, // Кнопки для выбора слов (два ряда по 5)
        paginationButtons, // Кнопки для пагинации
      ]);

      // Сохраняем текущую страницу в сессии
      ctx.session.page = page;

      // Отправляем сообщение с результатами и клавиатурой
      await sendOrEditMessage(ctx, resultMessage, selectionKeyboard);
    } else {
      await ctx.reply("Ошибка при получении данных.");
    }
  } catch (error) {
    console.error(error);
    await ctx.reply("Произошла ошибка при запросе.");
  }
}



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

      // Выводим выбранное слово пользователю
      await ctx.reply(`Вы выбрали слово: ${selectedWord.text} (${selectedWord.language})`);
    } else {
      await ctx.reply("Ошибка при получении данных.");
    }
  });
}


// Обработчик для кнопок пагинации
dictionaryWizard.action(/^page_\d+$/, async (ctx) => {
  const page = parseInt(ctx.match[0].split('_')[1]);
  ctx.session.page = page 
  await fetchWordsOnApproval(ctx, page, 10);
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
