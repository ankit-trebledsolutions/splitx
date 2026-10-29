import { registerRootComponent } from 'expo';
import { defineReminderPushTask } from './src/utils/reminderPushTask';
import App from './App';

// Before the app is registered: a silent reminder push starts this file in the
// background with nothing on screen, so the task has to exist by the time the
// imports above have run.
defineReminderPushTask();

registerRootComponent(App);
