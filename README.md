# Car Damage Detection and Repair Cost Estimation

This repository now focuses on a runnable web demo for uploading a car image, detecting damages using a YOLO model, and showing an estimated repair cost range per detected class.

## Quickstart

1) Create a Python environment and install dependencies:

```bash
pip install -r requirements.txt
```

2) Run the Streamlit app:

```bash
streamlit run app.py
```

3) Upload a car image to see detections (bounding boxes) and cost ranges.

## API

Start the API:

```bash
uvicorn api:app --reload
```

Endpoints:
- POST `/predict` with form field `image`: returns detected classes, counts, and cost summary
- POST `/compare` with form fields `before`, `after`: returns delta counts and new-damage cost summary

## Model and Price Map
- YOLO weights: `Repair_Cost_Estimation_Based_On_Car_Damage/src/Model/best.pt`
- Price mapping: `Repair_Cost_Estimation_Based_On_Car_Damage/src/car_damage_price.json`

Customise the JSON to match your classes and currency. 
