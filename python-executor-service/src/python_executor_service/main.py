from __future__ import annotations

from .claim_loop import ClaimLoop
from .config import ExecutorConfig


def main() -> None:
    cfg = ExecutorConfig.from_env()
    loop = ClaimLoop(cfg)
    loop.run_forever()


if __name__ == "__main__":
    main()
