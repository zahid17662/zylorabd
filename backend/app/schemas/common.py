import re

from pydantic import BaseModel, ConfigDict

BD_PHONE = re.compile(r"^(?:\+?88)?(01[3-9]\d{8})$")


def normalize_phone(value: str) -> str:
    m = BD_PHONE.match(value.strip().replace(" ", "").replace("-", ""))
    if not m:
        raise ValueError("Enter a valid Bangladeshi mobile number")
    return m.group(1)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)
