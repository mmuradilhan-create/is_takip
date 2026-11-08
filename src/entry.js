import { startMainApp } from "./main.js";
import { startStandaloneWidget } from "./standalone-widget.js";

if (location.hash.split("?")[0] === "#widget") {
  startStandaloneWidget();
} else {
  await startMainApp();
}
