#!/usr/bin/env python3
"""
One-time OAuth2 authorisation flow for a Google account.

Run this on your LOCAL MACHINE (needs a browser). Copy the resulting
token.json to the server afterwards.

Usage:
    python google_auth.py --account personal --credentials /path/to/client_secret.json

The token will be saved to ./tokens/<account>/token.json.
Copy it to the server:
    scp tokens/<account>/token.json damian@192.168.0.100:/home/damian/nucbox-g3-docker/mcp/credentials/<account>/token.json
"""

import argparse
import json
import os

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]


def main():
    parser = argparse.ArgumentParser(description="Authorise a Google account for Drive MCP.")
    parser.add_argument("--account", required=True, help="Account name (e.g. personal, work)")
    parser.add_argument(
        "--credentials",
        default="client_secret.json",
        help="Path to OAuth2 client secret JSON downloaded from Google Cloud Console",
    )
    args = parser.parse_args()

    out_dir = os.path.join("tokens", args.account)
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "token.json")

    flow = InstalledAppFlow.from_client_secrets_file(args.credentials, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(out_path, "w") as f:
        f.write(creds.to_json())

    print(f"\nToken saved to: {out_path}")
    print(f"\nCopy to server:")
    print(
        f"  ssh damian@192.168.0.100 'mkdir -p /home/damian/nucbox-g3-docker/mcp/credentials/{args.account}'"
    )
    print(
        f"  scp {out_path} damian@192.168.0.100:/home/damian/nucbox-g3-docker/mcp/credentials/{args.account}/token.json"
    )


if __name__ == "__main__":
    main()
