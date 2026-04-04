import { execSync } from "child_process";
try {
  console.log("Running train_models.py...");
  execSync("python3 train_models.py", { stdio: "inherit" });
  console.log("Done.");
} catch (e) {
  console.error("Failed to run train_models.py:", e);
}
