import { Context, Scenes } from "telegraf";

// Интерфейс сессии для Wizard-сцены
interface MyWizardSession extends Scenes.WizardSessionData {
  cursor: number; // Обязательно поле для wizard-сцен
  // Добавьте любые другие поля, которые могут быть нужны для сессии
}

// Интерфейс контекста
export interface MyContext extends Context {
  scene: Scenes.SceneContextScene<MyContext, MyWizardSession>;
  wizard: Scenes.WizardContextWizard<MyContext>;
  session: Scenes.SceneSession<MyWizardSession>; // Поддержка wizard-сессии
}
