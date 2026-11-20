"""The one-command run (started by run_islandale_pc.bat, or by hand): check the bundle, self-check Unreal, import the 6F
files, build a check level, check it, and save a screenshot per camera, writing every step in plain words to a log.

Runs inside the Unreal editor, with no arguments, so no path has to survive Windows quoting:
    UnrealEditor.exe <IslandaleUE.uproject> -unattended -nosplash -ExecutePythonScript="<repo>\\tools\\unreal\\pc_run.py"
The bundle is ISLANDALE_BUNDLE if set, else <repo>/build/3d/unreal (the folder holding scene/ and textures/). Everything
lands in <bundle>/pc-runs/<date-time>/: run_log.txt, check.json and the screenshots. Copy that folder back."""
import datetime
import json
import os
import pathlib
import sys
import traceback

import unreal

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(HERE))
import api_check  # noqa: E402
import check_6f  # noqa: E402


class RunLog:
    def __init__(self, path: pathlib.Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self.step = "starting"

    def say(self, msg: str) -> None:
        line = f"{datetime.datetime.now():%H:%M:%S}  [{self.step}]  {msg}"
        with self.path.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
        unreal.log(f"ISLANDALE {line}")

    def begin(self, step: str) -> None:
        self.step = step
        self.say("started")

    def fail(self, err: BaseException) -> None:
        self.say(f"FAILED: {err}")
        with self.path.open("a", encoding="utf-8") as f:
            f.write("\nDetails for whoever fixes it:\n" + "".join(traceback.format_exception(err)) + "\n")


def summary(report: dict) -> list:
    """The check's results in plain words."""
    lines = [f"engine {report.get('engine')}"]
    bad = [r["group"] for r in report.get("bounds", []) if not r["ok"]]
    lines.append("every file came in the right size and place" if not bad else f"wrong size or place: {', '.join(bad)}")
    for r in report.get("north_and_ground", []):
        lines.append(f"{r['group']}: {'north and ground right' if r['ok'] else 'PROBLEM'} "
                     f"(ground {r.get('ground_z_cm')} cm, lowest point {r.get('lowest_z_cm')} cm)")
    sea = report.get("sea", {})
    lines.append(f"sea at {sea.get('sea_z_cm')} cm, tide {sea.get('tide_cm')} cm: {'right' if sea.get('ok') else 'PROBLEM'}")
    if report.get("shots_error"):
        lines.append(f"screenshots failed: {report['shots_error']}")
    else:
        lines.append(f"{len(report.get('shots', []))} screenshots saved"
                     + ("" if report.get("shaders_settled", True) else " (shaders were still compiling: may look grey)"))
    lines.append("ALL CHECKS PASSED" if report.get("ok") else "SOME CHECKS FAILED (see above and check.json)")
    return lines


def main():
    bundle = pathlib.Path(os.environ.get("ISLANDALE_BUNDLE") or REPO / "build" / "3d" / "unreal")
    out = bundle / "pc-runs" / f"{datetime.datetime.now():%Y-%m-%d_%H%M%S}"
    log = RunLog(out / "run_log.txt")
    log.say(f"bundle {bundle}; results in {out}")

    def done(report):
        log.begin("done")
        for line in summary(report):
            log.say(line)
        log.say("Copy this whole folder back: " + str(out))

    try:
        log.begin("1 of 3: check the bundle")
        scene_dir = bundle / "scene"
        if not (scene_dir / "scene.json").exists():
            raise FileNotFoundError(f"no scene/scene.json in {bundle}. Copy the Islandale bundle (the folder with scene/ "
                                    "and textures/) to build/3d/unreal in the repo, or set ISLANDALE_BUNDLE to it")
        scene = json.loads((scene_dir / "scene.json").read_text(encoding="utf-8"))
        lost = [g["file"] for g in scene["groups"] if not (scene_dir / g["file"]).exists()]
        if not (scene_dir / scene["textures"]["materials_json"]).exists():
            lost.append(scene["textures"]["materials_json"])
        if lost:
            raise FileNotFoundError(f"the bundle is missing {', '.join(lost)}: copy it again")
        log.say(f"{len(scene['groups'])} files and the textures found")
        log.begin("2 of 3: self-check Unreal")
        api_check.require(api_check.CHECK_6F + api_check.CHECK_6F_SOURCE, log.say)
        missing_6g = api_check.missing(api_check.IMPORT_6G + api_check.IMPORT_6G_SOURCE)
        log.say("6G names: all found" if not missing_6g else f"6G names missing (6G will need another way): {missing_6g}")
        log.begin("3 of 3: import, check and take screenshots")
        check_6f.run(scene_dir, out, quit_after=True, on_done=done, say=log.say)
        log.say("waiting for shaders to compile, then taking screenshots (a few minutes the first time)")
    except Exception as err:  # noqa: BLE001 - every failure goes to the log in plain words, then Unreal closes
        log.fail(err)
        unreal.EditorPythonScripting.set_keep_python_script_alive(False)
        unreal.SystemLibrary.quit_editor()


main()
