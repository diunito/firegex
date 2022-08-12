import asyncio
from ipaddress import ip_address, ip_interface
import os, socket, psutil, sys, nftables
from fastapi_socketio import SocketManager

LOCALHOST_IP = socket.gethostbyname(os.getenv("LOCALHOST_IP","127.0.0.1"))

socketio:SocketManager = None

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ROUTERS_DIR = os.path.join(ROOT_DIR,"routers")
ON_DOCKER = len(sys.argv) > 1 and sys.argv[1] == "DOCKER"
DEBUG = len(sys.argv) > 1 and sys.argv[1] == "DEBUG"
FIREGEX_PORT = int(os.getenv("PORT","4444"))
JWT_ALGORITHM: str = "HS256"
API_VERSION = "2.0.0"

async def run_func(func, *args, **kwargs):
    if asyncio.iscoroutinefunction(func): 
        return await func(*args, **kwargs)
    else: 
        return func(*args, **kwargs)

async def refresh_frontend():
    await socketio.emit("update","Refresh")

def refactor_name(name:str):
    name = name.strip()
    while "  " in name: name = name.replace("  "," ")
    return name

def list_files(mypath):
    from os import listdir
    from os.path import isfile, join
    return [f for f in listdir(mypath) if isfile(join(mypath, f))]

def ip_parse(ip:str):
    return str(ip_interface(ip).network)

def addr_parse(ip:str):
    return str(ip_address(ip))

def ip_family(ip:str):
    return "ip6" if ip_interface(ip).version == 6 else "ip"

def get_interfaces():
    def _get_interfaces():
        for int_name, interfs in psutil.net_if_addrs().items():
            for interf in interfs:
                if interf.family in [socket.AF_INET, socket.AF_INET6]:
                    yield {"name": int_name, "addr":interf.address}
    return list(_get_interfaces())

def nftables_int_to_json(ip_int):
    ip_int = ip_parse(ip_int)
    ip_addr = str(ip_int).split("/")[0]
    ip_addr_cidr = int(str(ip_int).split("/")[1])
    return {"prefix": {"addr": ip_addr, "len": ip_addr_cidr}}

def nftables_json_to_int(ip_json_int):
    if isinstance(ip_json_int,str):
        return str(ip_parse(ip_json_int))
    else:
        return f'{ip_json_int["prefix"]["addr"]}/{ip_json_int["prefix"]["len"]}'
    
class Singleton(object):
    __instance = None
    def __new__(class_, *args, **kwargs):
        if not isinstance(class_.__instance, class_):
            class_.__instance = object.__new__(class_, *args, **kwargs)
        return class_.__instance

class NFTableManager(Singleton):
    
    table_name = "firegex"
    
    def __init__(self, init_cmd, reset_cmd):
        self.__init_cmds = init_cmd
        self.__reset_cmds = reset_cmd
        self.nft = nftables.Nftables()
    
    def raw_cmd(self, *cmds):
        return self.nft.json_cmd({"nftables": list(cmds)})

    def cmd(self, *cmds):
        code, out, err = self.raw_cmd(*cmds)

        if code == 0: return out
        else: raise Exception(err)
    
    def init(self):
        self.reset()
        self.raw_cmd({"add":{"table":{"name":self.table_name,"family":"inet"}}})
        self.cmd(*self.__init_cmds)
            
    def reset(self):
        self.raw_cmd(*self.__reset_cmds)

    def list_rules(self, tables = None, chains = None):
        for filter in [ele["rule"] for ele in self.raw_list() if "rule" in ele ]:
            if tables and filter["table"] not in tables: continue
            if chains and filter["chain"] not in chains: continue
            yield filter
    
    def raw_list(self):
        return self.cmd({"list": {"ruleset": None}})["nftables"]

            