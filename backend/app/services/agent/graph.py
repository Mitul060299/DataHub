from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from .groq_compat import apply_groq_compat_patches

apply_groq_compat_patches()

from .edges import (
    route_after_drift_detector,
    route_after_execute,
    route_after_goal_parser,
    route_after_goal_verifier,
    route_after_present_unified,
    route_after_prior_pipeline_parser,
    route_after_reflect,
    route_after_reflection_v2,
    route_after_step_validator,
    route_intent_auto,
)
from .nodes.auto_planner import auto_planner
from .nodes.clarify_step import clarify_step
from .nodes.context_loader import context_loader
from .nodes.drift_detector import drift_detector
from .nodes.execute_step import execute_step
from .nodes.goal_parser import goal_parser
from .nodes.goal_verifier import goal_verifier
from .nodes.intent_classifier import intent_classifier
from .nodes.interrupt_asker import interrupt_asker
from .nodes.pipeline_recorder import pipeline_recorder
from .nodes.plan_presenter import plan_presenter
from .nodes.planner import planner
from .nodes.prior_pipeline_parser import prior_pipeline_parser
from .nodes.reflect import reflect
from .nodes.reflection_v2 import reflection_v2
from .nodes.responder import responder
from .nodes.step_validator import step_validator
from .state import AgentState


def build_agent_graph():
    graph = StateGraph(AgentState)

    # ------------------------------------------------------------------
    # Manual Mode nodes (unchanged)
    # ------------------------------------------------------------------
    graph.add_node("context_loader", context_loader)
    graph.add_node("intent_classifier", intent_classifier)
    graph.add_node("clarify_step", clarify_step)
    graph.add_node("planner", planner)
    graph.add_node("plan_presenter", plan_presenter)
    graph.add_node("execute_step", execute_step)
    graph.add_node("reflect", reflect)
    graph.add_node("pipeline_recorder", pipeline_recorder)
    graph.add_node("responder", responder)

    # ------------------------------------------------------------------
    # Auto Mode nodes
    # ------------------------------------------------------------------
    graph.add_node("prior_pipeline_parser", prior_pipeline_parser)
    graph.add_node("goal_parser", goal_parser)
    graph.add_node("drift_detector", drift_detector)
    graph.add_node("auto_planner", auto_planner)
    graph.add_node("step_validator", step_validator)
    graph.add_node("reflection_v2", reflection_v2)
    graph.add_node("interrupt_asker", interrupt_asker)
    graph.add_node("goal_verifier", goal_verifier)

    # ------------------------------------------------------------------
    # Entry point
    # ------------------------------------------------------------------
    graph.set_entry_point("context_loader")

    # ------------------------------------------------------------------
    # Manual Mode edges (unchanged)
    # ------------------------------------------------------------------
    graph.add_edge("context_loader", "intent_classifier")
    graph.add_edge("clarify_step", END)
    graph.add_edge("planner", "plan_presenter")
    graph.add_edge("pipeline_recorder", "responder")
    graph.add_edge("responder", END)

    graph.add_conditional_edges(
        "intent_classifier",
        route_intent_auto,  # replaces route_intent — handles both modes
        {
            # Manual Mode destinations
            "clarify_step": "clarify_step",
            "planner": "planner",
            "execute_step": "execute_step",
            "responder": "responder",
            # Auto Mode destinations
            "prior_pipeline_parser": "prior_pipeline_parser",
            "goal_parser": "goal_parser",
        },
    )
    graph.add_conditional_edges(
        "plan_presenter",
        route_after_present_unified,
        {"execute_step": "execute_step", "__end__": END},
    )
    graph.add_conditional_edges(
        "execute_step",
        route_after_execute,
        {
            "reflect": "reflect",
            "execute_step": "execute_step",
            "pipeline_recorder": "pipeline_recorder",
            # Auto path destinations (route_after_execute_auto is called when auto_mode is set)
            "step_validator": "step_validator",
            "reflection_v2": "reflection_v2",
            "goal_verifier": "goal_verifier",
        },
    )
    graph.add_conditional_edges(
        "reflect",
        route_after_reflect,
        {
            "pipeline_recorder": "pipeline_recorder",
            "execute_step": "execute_step",
        },
    )

    # ------------------------------------------------------------------
    # Auto Mode edges
    # ------------------------------------------------------------------
    graph.add_conditional_edges(
        "prior_pipeline_parser",
        route_after_prior_pipeline_parser,
        {"drift_detector": "drift_detector"},
    )
    graph.add_conditional_edges(
        "goal_parser",
        route_after_goal_parser,
        {"drift_detector": "drift_detector", "auto_planner": "auto_planner"},
    )
    graph.add_conditional_edges(
        "drift_detector",
        route_after_drift_detector,
        {"auto_planner": "auto_planner"},
    )
    graph.add_edge("auto_planner", "plan_presenter")

    graph.add_conditional_edges(
        "step_validator",
        route_after_step_validator,
        {
            "execute_step": "execute_step",
            "goal_verifier": "goal_verifier",
            "reflection_v2": "reflection_v2",
        },
    )
    graph.add_conditional_edges(
        "reflection_v2",
        route_after_reflection_v2,
        {"execute_step": "execute_step", "interrupt_asker": "interrupt_asker"},
    )
    graph.add_edge("interrupt_asker", END)  # suspend; resume via /auto/run/resume

    graph.add_conditional_edges(
        "goal_verifier",
        route_after_goal_verifier,
        {
            "auto_planner": "auto_planner",
            "interrupt_asker": "interrupt_asker",
            "pipeline_recorder": "pipeline_recorder",
        },
    )

    return graph.compile(checkpointer=MemorySaver())


agent_graph = build_agent_graph()
