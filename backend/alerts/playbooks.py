"""
MITRE ATT&CK mapping and analyst response playbooks per attack class.

Static, reviewed content (not model output): technique IDs are from ATT&CK
Enterprise, and the response steps are conventional SOC containment practice
written for flow-metadata detections (no payload visibility). Each playbook
also says what evidence would make the alert *benign*, because an
explainable triage tool should help the analyst dismiss as well as escalate.
"""

from typing import Dict, List, Optional

ATTACK_BASE_URL = "https://attack.mitre.org/techniques/"


def _tech(tid: str, name: str, tactic: str) -> dict:
    return {
        "id": tid,
        "name": name,
        "tactic": tactic,
        "url": ATTACK_BASE_URL + tid.replace(".", "/") + "/",
    }


PLAYBOOKS: Dict[str, dict] = {
    "DNS_TUNNELING": {
        "title": "DNS tunneling / exfiltration over DNS",
        "summary": (
            "Data or commands are being smuggled inside DNS names, which stays "
            "invisible when the resolver traffic is encrypted (DoH). The flow "
            "looks like long, high-entropy, unusually frequent lookups."
        ),
        "techniques": [
            _tech("T1071.004", "Application Layer Protocol: DNS", "Command and Control"),
            _tech("T1572", "Protocol Tunneling", "Command and Control"),
            _tech("T1048", "Exfiltration Over Alternative Protocol", "Exfiltration"),
        ],
        "confirm_if": [
            "Query names are long and random-looking (base32/base64 labels) under one parent domain.",
            "One host issues far more DNS queries than its peers, often with TXT or NULL records.",
        ],
        "benign_if": [
            "The source is a known CDN, security-vendor, or telemetry client that uses long generated hostnames.",
        ],
        "steps": [
            "Identify the internal host behind the source IP and the parent domain it is querying.",
            "Sinkhole or block the parent domain at the resolver and egress proxy.",
            "Restrict DoH to the approved resolver and block direct DoH endpoints at the firewall.",
            "Isolate the host, then collect its process list and recent DNS logs for the same window.",
            "Estimate the data volume sent and follow your data-loss process if it is significant.",
        ],
    },
    "DOS_DDOS": {
        "title": "Volumetric denial of service",
        "summary": (
            "A flood of packets with very short gaps and many SYNs is aimed at "
            "one target, trying to exhaust bandwidth, connection tables or CPU."
        ),
        "techniques": [
            _tech("T1498", "Network Denial of Service", "Impact"),
            _tech("T1499", "Endpoint Denial of Service", "Impact"),
        ],
        "confirm_if": [
            "Packets per second and SYN counts are many times the target's normal baseline.",
            "Service latency or error rates on the destination rise at the same time.",
        ],
        "benign_if": [
            "A scheduled load test, backup, or product launch explains the burst and is on the change calendar.",
        ],
        "steps": [
            "Confirm impact on the destination service (latency, error rate, connection table).",
            "Apply rate limiting or SYN-cookie protection at the edge for the offending sources.",
            "Engage the upstream provider or DDoS scrubbing service if the flood is distributed.",
            "Block or null-route confirmed attacker ranges; keep the rules time-boxed.",
            "Record start time, peak rate and sources for the post-incident report.",
        ],
    },
    "PORT_SCAN": {
        "title": "Network reconnaissance / port scan",
        "summary": (
            "One source is probing many destination ports with tiny, mostly "
            "incomplete connections, mapping which services are exposed."
        ),
        "techniques": [
            _tech("T1046", "Network Service Discovery", "Discovery"),
            _tech("T1595.001", "Active Scanning: Scanning IP Blocks", "Reconnaissance"),
        ],
        "confirm_if": [
            "The same source touches many ports or hosts in a short window with bare SYNs.",
            "The source is external, or internal but not a sanctioned scanner.",
        ],
        "benign_if": [
            "The source is your vulnerability scanner or an inventory tool inside its scan window.",
        ],
        "steps": [
            "Check whether the source is an approved scanner; if so, dismiss and tag it.",
            "Otherwise block the source at the perimeter and note the ports it reached.",
            "Review exposed services on the scanned hosts and close anything unnecessary.",
            "Watch for the same source returning with exploit or login attempts.",
        ],
    },
    "BRUTE_FORCE": {
        "title": "Credential brute force",
        "summary": (
            "Many short, completed attempts hit one service at a steady pace, "
            "consistent with password guessing or credential stuffing."
        ),
        "techniques": [
            _tech("T1110", "Brute Force", "Credential Access"),
            _tech("T1110.003", "Brute Force: Password Spraying", "Credential Access"),
        ],
        "confirm_if": [
            "Authentication logs on the destination show repeated failures from this source.",
            "A success follows a run of failures (possible compromise).",
        ],
        "benign_if": [
            "A misconfigured service account or automation is retrying with a stale password.",
        ],
        "steps": [
            "Pull authentication logs for the destination and count failures and any success from the source.",
            "Block the source and enforce lockout or rate limiting on the service.",
            "If any login succeeded, force a credential reset and review that session's activity.",
            "Require MFA on the exposed service if it is not already enforced.",
        ],
    },
    "BOTNET": {
        "title": "Botnet command-and-control beaconing",
        "summary": (
            "A long-lived, low-volume flow with steady, periodic timing and "
            "generated-looking lookups suggests an infected host checking in "
            "with a controller."
        ),
        "techniques": [
            _tech("T1071", "Application Layer Protocol", "Command and Control"),
            _tech("T1568.002", "Dynamic Resolution: Domain Generation Algorithms", "Command and Control"),
        ],
        "confirm_if": [
            "Connections repeat at near-constant intervals to a rare or newly registered destination.",
            "The host also resolves many random-looking domains that mostly fail.",
        ],
        "benign_if": [
            "The destination is a known update service, monitoring agent or chat client with periodic keep-alives.",
        ],
        "steps": [
            "Isolate the suspected host from the network and preserve its memory and disk state.",
            "Block the destination IP and any domains it resolved at DNS and egress.",
            "Run an endpoint scan for persistence and lateral movement from that host.",
            "Search other hosts for connections to the same destination.",
            "Rebuild or reimage the host and rotate credentials that were present on it.",
        ],
    },
}


def playbook_for(attack_type: str) -> Optional[dict]:
    return PLAYBOOKS.get(attack_type)


def techniques_for(attack_type: str) -> List[dict]:
    pb = PLAYBOOKS.get(attack_type)
    return pb["techniques"] if pb else []
