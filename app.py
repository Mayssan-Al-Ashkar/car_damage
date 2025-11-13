import streamlit as st
from PIL import Image
import numpy as np
import json
from pathlib import Path

from services.inference import (
    load_price_map,
    detect_from_numpy,
    aggregate_costs_for_classes,
    compare_before_after,
)

st.set_page_config(page_title="Car Damage Estimator", layout="wide")

st.markdown("""
    <style>
        body { background-color: #121212; color: white; font-family: Arial, sans-serif; }
        .stButton button { background-color: #cba135; color: black; border-radius: 8px; padding: 10px 20px; font-weight: bold; }
        .stImage img { border-radius: 10px; }
        .metric { font-size: 28px; font-weight: bold; color: #cba135; }
    </style>
""", unsafe_allow_html=True)

st.markdown("<h1 style='text-align: center;'>Repair Cost Car Damage Estimation</h1>", unsafe_allow_html=True)

price_map = load_price_map()

tab_single, tab_compare = st.tabs(["Single Image", "Before / After Compare"])

with tab_single:
    uploaded_file = st.file_uploader("Upload an image (pick-up or return)", type=["jpg", "jpeg", "png"], key="single")
    if uploaded_file is not None:
        col1, col2 = st.columns(2)
        image = Image.open(uploaded_file).convert("RGB")
        image_array = np.array(image)
        det = detect_from_numpy(image_array)
        with col1:
            st.image(image, caption="Uploaded Image", use_column_width=True)
        with col2:
            st.image(det["annotated_image"], caption="Detection Result", use_column_width=True)

        st.markdown("### Detected Damages")
        if det["classes"]:
            cost_summary = aggregate_costs_for_classes(det["classes"], price_map)
            for cls, count in cost_summary["counts"].items():
                if cls in price_map:
                    st.markdown(f" <b>{cls}</b> × {count} → <b>{price_map[cls]}</b>", unsafe_allow_html=True)
                else:
                    st.markdown(f"ℹ️ <b>{cls}</b> × {count} (no price configured)", unsafe_allow_html=True)
            totals = cost_summary["totals"]
            if totals["open_ended"] or totals["max"] is None:
                st.markdown(f"**Estimated Total:** ≥ {totals['min']:,} {totals['currency']}")
            else:
                st.markdown(f"**Estimated Total:** {totals['min']:,} – {totals['max']:,} {totals['currency']}")
        else:
            st.warning("No damages detected. Try a closer or clearer image.")

with tab_compare:
    col_left, col_right = st.columns(2)
    with col_left:
        before_file = st.file_uploader("Pick-up (Before) image", type=["jpg", "jpeg", "png"], key="before")
    with col_right:
        after_file = st.file_uploader("Return (After) image", type=["jpg", "jpeg", "png"], key="after")

    if before_file is not None and after_file is not None:
        before = Image.open(before_file).convert("RGB")
        after = Image.open(after_file).convert("RGB")
        summary = compare_before_after(np.array(before), np.array(after), price_map)

        c1, c2 = st.columns(2)
        with c1:
            st.image(summary["before"]["annotated_image"], caption="Pick-up (Before) Detection", use_column_width=True)
        with c2:
            st.image(summary["after"]["annotated_image"], caption="Return (After) Detection", use_column_width=True)

        st.markdown("### New Damages Detected (After vs Before)")
        if summary["new_damage_counts"]:
            for cls, n in summary["new_damage_counts"].items():
                st.markdown(f"➕ <b>{cls}</b> × {n}", unsafe_allow_html=True)
            totals = summary["new_damage_costs"]["totals"]
            if totals["open_ended"] or totals["max"] is None:
                st.markdown(f"**Estimated New Damage Total:** ≥ {totals['min']:,} {totals['currency']}")
            else:
                st.markdown(f"**Estimated New Damage Total:** {totals['min']:,} – {totals['max']:,} {totals['currency']}")
        else:
            st.info("No additional damages detected at return.")

st.markdown("""
    <br><br>
    <hr style="border: 1px solid #cba135;">
    <p style="text-align: center; color: #cba135;">
         Powered by AI | Car Damage Estimation System
    </p>
""", unsafe_allow_html=True)


