#!/usr/bin/env python3
from utils.colors import *
from utils.firegexapi import *
import argparse, secrets

parser = argparse.ArgumentParser()
parser.add_argument("--address", "-a", type=str , required=False, help='Address of firegex backend', default="http://127.0.0.1:4444/")
parser.add_argument("--password", "-p", type=str, required=False, help='Firegex password')
args = parser.parse_args()
sep()
puts(f"Testing will start on ", color=colors.cyan, end="")
puts(f"{args.address}", color=colors.yellow)

firegex = FiregexAPI(args.address)
password = ""
#Connect to Firegex
if args.password:
    password = args.password
    if (firegex.login(args.password)): puts(f"Sucessfully logged in ✔", color=colors.green)
    else: puts(f"Test Failed: Unknown response or wrong passowrd ✗", color=colors.red); exit(1)
else:
    password = secrets.token_hex(10)
    if (firegex.set_password(args.password)): puts(f"Sucessfully set password to {password} ✔", color=colors.green)
    else: puts(f"Test Failed: Unknown response or password already put ✗", color=colors.red); exit(1)

if(firegex.status()["loggined"]): puts(f"Correctly received status ✔", color=colors.green)
else: puts(f"Test Failed: Unknown response or not logged in✗", color=colors.red); exit(1)

#Prepare second instance
firegex2 = FiregexAPI(args.address)
if (firegex2.login(password)): puts(f"Sucessfully logged in on second instance ✔", color=colors.green)
else: puts(f"Test Failed: Unknown response or wrong passowrd on second instance ✗", color=colors.red); exit(1)

if(firegex2.status()["loggined"]): puts(f"Correctly received status on second instance✔", color=colors.green)
else: puts(f"Test Failed: Unknown response or not logged in on second instance✗", color=colors.red); exit(1)

#Change password
new_password = secrets.token_hex(10)
if (firegex.change_password(new_password,expire=True)): puts(f"Sucessfully changed password to {new_password} ✔", color=colors.green)
else: puts(f"Test Failed: Coundl't change the password ✗", color=colors.red); exit(1)

#Check if we are still logged in
if(firegex.status()["loggined"]): puts(f"Correctly received status after password change ✔", color=colors.green)
else: puts(f"Test Failed: Unknown response or not logged after password change ✗", color=colors.red); exit(1)

#Check if second session expired and relog

if(not firegex2.status()["loggined"]): puts(f"Second instance was expired currectly ✔", color=colors.green)
else: puts(f"Test Failed: Still logged in on second instance, expire expected ✗", color=colors.red); exit(1)
if (firegex2.login(new_password)): puts(f"Sucessfully logged in on second instance ✔", color=colors.green)
else: puts(f"Test Failed: Unknown response or wrong passowrd on second instance ✗", color=colors.red); exit(1)

#Change it back
if (firegex.change_password(password,expire=False)): puts(f"Sucessfully restored the password ✔", color=colors.green)
else: puts(f"Test Failed: Coundl't change the password ✗", color=colors.red); exit(1)

#Check if we are still logged in
if(firegex2.status()["loggined"]): puts(f"Correctly received status after password change ✔", color=colors.green)
else: puts(f"Test Failed: Unknown response or not logged after password change ✗", color=colors.red); exit(1)

puts("List of available interfaces:", color=colors.yellow)
for interface in firegex.get_interfaces(): puts("name: {}, address: {}".format(interface["name"], interface["addr"]), color=colors.yellow)