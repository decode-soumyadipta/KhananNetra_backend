"""Prestart hook to ensure ML model is present before Uvicorn launches workers."""

from app.utils.model_loader import get_model_path
from app.services.ml_inference_service import get_ml_service


def main() -> None:
    model_path = get_model_path()
    print(f"✅ Prestart: model ready at {model_path}")

    try:
        info = get_ml_service().preload_model()
        size_mb = info.get('model_size_mb')
        if size_mb:
            print(f"✅ Prestart: model verified ({size_mb:.2f} MB)")
        else:
            print("✅ Prestart: model verified")
    except Exception as exc:
        print(f"⚠️  Prestart: failed to preload ML service: {exc}")


if __name__ == "__main__":
    main()
