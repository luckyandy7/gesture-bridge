from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModuleSpec:
    path: str
    role: str
    starter_tasks: tuple[str, ...]


@dataclass(frozen=True)
class ModeSpec:
    name: str
    goal: str
    input_shape: str
    output_shape: str
    starter_scope: tuple[str, ...]


@dataclass(frozen=True)
class PhaseSpec:
    name: str
    objective: str
    deliverables: tuple[str, ...]


@dataclass(frozen=True)
class ProjectBlueprint:
    name: str
    summary: str
    modules: tuple[ModuleSpec, ...]
    modes: tuple[ModeSpec, ...]
    phases: tuple[PhaseSpec, ...]


def build_blueprint() -> ProjectBlueprint:
    modules = (
        ModuleSpec(
            path="core/camera.py",
            role="Read webcam frames and normalize camera settings.",
            starter_tasks=(
                "Open webcam safely and expose frame timestamps.",
                "Keep frame resize and mirroring in one place.",
            ),
        ),
        ModuleSpec(
            path="core/landmarks.py",
            role="Extract MediaPipe hand landmarks and handedness.",
            starter_tasks=(
                "Return 21 landmark points per hand.",
                "Convert detector output into a project-owned data shape.",
            ),
        ),
        ModuleSpec(
            path="core/stability.py",
            role="Smooth cursor position and stabilize gesture predictions.",
            starter_tasks=(
                "Add moving-average or EMA smoothing.",
                "Add cooldown gates to reduce repeated triggers.",
            ),
        ),
        ModuleSpec(
            path="modes/pc_control.py",
            role="Map static gestures into mouse, slide, or scroll actions.",
            starter_tasks=(
                "Implement finger-state heuristics for 5-8 gestures.",
                "Keep OS actions behind a separate adapter layer.",
            ),
        ),
        ModuleSpec(
            path="sign/dataset.py",
            role="Record two-hand plus arm/pose sequences for each sign label.",
            starter_tasks=(
                "Save per-label sequence files under data/raw/signs.",
                "Validate fixed sequence length before training.",
            ),
        ),
        ModuleSpec(
            path="sign/classifier.py",
            role="Train and load the first sequence classifier for sign tokens.",
            starter_tasks=(
                "Start with a small classical baseline or shallow sequence model.",
                "Return label and confidence, not free-form text.",
            ),
        ),
        ModuleSpec(
            path="modes/sign_text.py",
            role="Run live sign-token inference and print recognized text tokens.",
            starter_tasks=(
                "Buffer 30 landmark frames per inference window.",
                "Append only stable high-confidence tokens to output.",
            ),
        ),
    )

    modes = (
        ModeSpec(
            name="pc-control",
            goal="Low-latency gesture-driven control with minimal training data.",
            input_shape="single frame hand landmarks",
            output_shape="mouse or keyboard action",
            starter_scope=(
                "rule-based gesture recognition",
                "cursor smoothing",
                "cooldown-safe action mapping",
            ),
        ),
        ModeSpec(
            name="sign-text",
            goal="Recognize a limited set of sign tokens from both hands and arm motion.",
            input_shape="30-frame holistic sequence with both hands and pose",
            output_shape="single token label",
            starter_scope=(
                "10 sign labels",
                "two-hand plus pose dataset collection",
                "sequence classification with confidence threshold",
            ),
        ),
    )

    phases = (
        PhaseSpec(
            name="Phase 1",
            objective="Ship a stable PC-control demo first.",
            deliverables=(
                "camera pipeline",
                "hand landmarks",
                "5 gesture rules",
                "action cooldown layer",
            ),
        ),
        PhaseSpec(
            name="Phase 2",
            objective="Add sign-token data collection and offline training.",
            deliverables=(
                "label config",
                "sequence recorder",
                "baseline classifier",
                "saved model artifact",
            ),
        ),
        PhaseSpec(
            name="Phase 3",
            objective="Unify both modes behind one app shell.",
            deliverables=(
                "mode switch",
                "prediction overlay",
                "logs or output buffer",
                "demo-ready README and screenshots",
            ),
        ),
    )

    return ProjectBlueprint(
        name="Gesture Bridge",
        summary="One hand-tracking core with two outputs: sign-to-text and PC control.",
        modules=modules,
        modes=modes,
        phases=phases,
    )


def render_overview(blueprint: ProjectBlueprint) -> str:
    lines = [blueprint.name, blueprint.summary, "", "Modes"]

    for mode in blueprint.modes:
        lines.extend(
            (
                f"- {mode.name}: {mode.goal}",
                f"  input: {mode.input_shape}",
                f"  output: {mode.output_shape}",
                f"  starter scope: {', '.join(mode.starter_scope)}",
            )
        )

    lines.append("")
    lines.append("Modules")

    for module in blueprint.modules:
        lines.extend(
            (
                f"- {module.path}: {module.role}",
                f"  first tasks: {', '.join(module.starter_tasks)}",
            )
        )

    return "\n".join(lines)


def render_roadmap(blueprint: ProjectBlueprint) -> str:
    lines = [blueprint.name, "", "Roadmap"]

    for phase in blueprint.phases:
        lines.extend(
            (
                f"- {phase.name}: {phase.objective}",
                f"  deliverables: {', '.join(phase.deliverables)}",
            )
        )

    return "\n".join(lines)


def render_tree(blueprint: ProjectBlueprint) -> str:
    module_paths = [module.path for module in blueprint.modules]

    lines = [
        "signlanguageProject/",
        "├── configs/",
        "│   ├── gesture_actions.example.json",
        "│   └── sign_labels.example.json",
        "├── src/",
        "│   └── gesture_bridge/",
        "│       ├── __main__.py",
        "│       ├── blueprint.py",
        "│       ├── cli.py",
        "│       ├── control/",
        "│       ├── core/",
        "│       ├── modes/",
        "│       └── sign/",
        "├── .gitignore",
        "├── pyproject.toml",
        "└── README.md",
        "",
        "Planned files",
    ]

    for path in module_paths:
        lines.append(f"- {path}")

    return "\n".join(lines)
