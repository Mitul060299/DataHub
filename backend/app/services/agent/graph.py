from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph

from .groq_compat import apply_groq_compat_patches

apply_groq_compat_patches()

from .edges import route_after_execute, route_after_present, route_after_reflect, route_intent
from .nodes.clarify_step import clarify_step
from .nodes.context_loader import context_loader
from .nodes.execute_step import execute_step
from .nodes.intent_classifier import intent_classifier
from .nodes.pipeline_recorder import pipeline_recorder
from .nodes.plan_presenter import plan_presenter
from .nodes.planner import planner
from .nodes.reflect import reflect
from .nodes.responder import responder
from .state import AgentState


def build_agent_graph():
    graph = StateGraph(AgentState)

    graph.add_node("context_loader", context_loader)
    graph.add_node("intent_classifier", intent_classifier)
    graph.add_node("clarify_step", clarify_step)
    graph.add_node("planner", planner)
    graph.add_node("plan_presenter", plan_presenter)
    graph.add_node("execute_step", execute_step)
    graph.add_node("reflect", reflect)
    graph.add_node("pipeline_recorder", pipeline_recorder)
    graph.add_node("responder", responder)

    graph.set_entry_point("context_loader")

    graph.add_edge("context_loader", "intent_classifier")
    graph.add_edge("clarify_step", END)
    graph.add_edge("planner", "plan_presenter")
    graph.add_edge("pipeline_recorder", "responder")
    graph.add_edge("responder", END)

    graph.add_conditional_edges(
        "intent_classifier",
        route_intent,
        {"clarify_step": "clarify_step", "planner": "planner", "execute_step": "execute_step", "responder": "responder"},
    )
    graph.add_conditional_edges(
        "plan_presenter",
        route_after_present,
        {"execute_step": "execute_step", "__end__": END},
    )
    graph.add_conditional_edges(
        "execute_step",
        route_after_execute,
        {
            "reflect": "reflect",
            "execute_step": "execute_step",
            "pipeline_recorder": "pipeline_recorder",
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

    return graph.compile(checkpointer=MemorySaver())


agent_graph = build_agent_graph()
