import zipfile
import os

svg_templates = {
    "1_cyberpunk_overdrive.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#07090e"/><stop offset="100%" stop-color="#020305"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#fff200"/><stop offset="100%" stop-color="#ffb700"/></linearGradient>
    <clipPath id="art"><polygon points="45,130 570,130 610,170 705,170 705,530 665,570 45,570"/></clipPath>
  </defs>
  <rect width="750" height="1050" fill="url(#bg)"/>
  <rect x="25" y="25" width="700" height="1000" fill="none" stroke="#fff200" stroke-width="0.75" stroke-opacity="0.2"/>
  <g clip-path="url(#art)"><rect x="45" y="130" width="660" height="440" fill="#0b1017"/><circle cx="375" cy="350" r="140" fill="none" stroke="#fff200" stroke-width="0.75" stroke-opacity="0.1" stroke-dasharray="8,4"/></g>
  <polygon points="43,128 572,128 612,168 707,168 707,532 667,572 43,572" fill="none" stroke="url(#accent)" stroke-width="2.5"/>
  <text x="75" y="100" fill="#ffffff" font-family="sans-serif" font-size="32" font-weight="900">OVERDRIVE_V1</text>
</svg>""",
    "2_titanium_hud.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#0c0e12"/>
  <path d="M 35,60 L 35,35 L 60,35 M 690,35 L 715,35 L 715,60 M 715,990 L 715,1015 L 690,1015 M 60,1015 L 35,1015 L 35,990" fill="none" stroke="#ff9500" stroke-width="3"/>
  <rect x="50" y="160" width="650" height="380" fill="#07090d" stroke="#ff9500" stroke-width="1.5"/>
  <text x="80" y="110" fill="#ffffff" font-family="monospace" font-size="34" font-weight="bold">DREADNOUGHT_MK2</text>
</svg>""",
    "3_neon_syndicate.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#030508"/>
  <rect x="40" y="140" width="670" height="420" fill="#090f16" stroke="#00f0ff" stroke-width="2"/>
  <text x="70" y="95" fill="#00f0ff" font-family="sans-serif" font-size="30" font-weight="bold">NEON_SYNDICATE</text>
</svg>""",
    "4_quantum_blueprint.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#020813"/>
  <circle cx="375" cy="350" r="150" fill="none" stroke="#00e5ff" stroke-width="1" stroke-opacity="0.3"/>
  <text x="60" y="100" fill="#00e5ff" font-family="monospace" font-size="28">QUANTUM_SYS_v9</text>
</svg>""",
    "5_solar_vanguard.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#140f06"/>
  <polygon points="50,150 700,150 650,520 50,520" fill="#24190b" stroke="#ff9900" stroke-width="2"/>
  <text x="80" y="110" fill="#ffffff" font-family="sans-serif" font-size="32" font-weight="bold">SOLAR_VANGUARD</text>
</svg>""",
    "6_xenobiology_swarm.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#040a05"/>
  <path d="M 80,160 C 80,160 375,120 670,160 L 670,540 C 670,540 375,580 80,540 Z" fill="#0a140d" stroke="#39ff14" stroke-width="2"/>
  <text x="90" y="100" fill="#39ff14" font-family="serif" font-size="30">BIO_SWARM_NODE</text>
</svg>""",
    "7_singularity_event.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#020105"/>
  <circle cx="375" cy="400" r="250" fill="none" stroke="#bd00ff" stroke-width="1.5" stroke-opacity="0.4"/>
  <text x="70" y="90" fill="#bd00ff" font-family="sans-serif" font-size="34" font-weight="800">SINGULARITY_EVENT</text>
</svg>""",
    "8_asymmetric_apex.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#090d14"/>
  <polygon points="40,120 550,120 590,160 710,160 710,550 40,550" fill="#111a2e" stroke="#0077ff" stroke-width="2"/>
  <text x="60" y="85" fill="#ffffff" font-family="sans-serif" font-size="32" font-weight="bold">APEX_TACTICAL</text>
</svg>""",
    "9_gothic_mech.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#050506"/>
  <path d="M 100,240 C 100,140 250,110 375,110 C 500,110 650,140 650,240 L 650,560 L 100,560 Z" fill="#141416" stroke="#ffffff" stroke-width="1.5"/>
  <text x="70" y="80" fill="#ffffff" font-family="serif" font-size="36" letter-spacing="4">ARCHANGEL_IV</text>
</svg>""",
    "10_cassette_futurism.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#e8e2ce"/>
  <rect x="75" y="160" width="600" height="380" rx="20" fill="#182224" stroke="#38352e" stroke-width="4"/>
  <text x="85" y="110" fill="#182224" font-family="sans-serif" font-size="32" font-weight="900">CARGO_HAULER_88</text>
</svg>""",
    "11_orbital_command.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#0d1117"/>
  <rect x="50" y="150" width="650" height="400" rx="8" fill="#161b22" stroke="#30363d" stroke-width="2"/>
  <text x="75" y="105" fill="#58a6ff" font-family="monospace" font-size="30">ORBITAL_COMMAND_NODE</text>
</svg>""",
    "12_glitch_core.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 750 1050">
  <rect width="750" height="1050" fill="#0b020f"/>
  <polygon points="60,140 690,140 670,510 80,550" fill="#1d072b" stroke="#ff00ff" stroke-width="2"/>
  <text x="80" y="95" fill="#00ffff" font-family="sans-serif" font-size="34" font-weight="bold">GLITCH_MATRIX_CORE</text>
</svg>"""
}

os.makedirs("/tmp/tcg_templates", exist_ok=True)
zip_path = "/tmp/professional_scifi_tcg_templates.zip"

with zipfile.ZipFile(zip_path, 'w') as zipf:
    for filename, content in svg_templates.items():
        file_p = f"/tmp/tcg_templates/{filename}"
        with open(file_p, "w") as f:
            f.write(content)
        zipf.write(file_p, filename)

print(f"Created zip with {len(svg_templates)} high-fidelity templates.")
