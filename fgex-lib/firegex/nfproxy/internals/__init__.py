from inspect import signature
from firegex.nfproxy.internals.models import Action, FullStreamAction
from firegex.nfproxy.internals.models import FilterHandler, PacketHandlerResult
import functools
from firegex.nfproxy.internals.data import DataStreamCtx
from firegex.nfproxy.internals.exceptions import NotReadyToRun, StreamFullReject, DropPacket, RejectConnection, StreamFullDrop
from firegex.nfproxy.internals.data import RawPacket

def context_call(glob, func, *args, **kargs):
    glob["__firegex_tmp_args"] = args
    glob["__firegex_tmp_kargs"] = kargs
    glob["__firege_tmp_call"] = func
    res = eval("__firege_tmp_call(*__firegex_tmp_args, **__firegex_tmp_kargs)", glob, glob)
    if "__firegex_tmp_args" in glob.keys():
        del glob["__firegex_tmp_args"]
    if "__firegex_tmp_kargs" in glob.keys():
        del glob["__firegex_tmp_kargs"]
    if "__firege_tmp_call" in glob.keys():
        del glob["__firege_tmp_call"]
    return res

def generate_filter_structure(filters: list[str], proto:str, glob:dict) -> list[FilterHandler]:
    from firegex.nfproxy.models import type_annotations_associations
    if proto not in type_annotations_associations.keys():
        raise Exception("Invalid protocol")
    res = []
    valid_annotation_type = type_annotations_associations[proto]
    def add_func_to_list(func):
        if not callable(func):
            raise Exception(f"{func} is not a function")
        sig = signature(func)
        params_function = {}
        
        for k, v in sig.parameters.items():
            if v.annotation in valid_annotation_type.keys():
                params_function[v.annotation] = valid_annotation_type[v.annotation]
            else:
                raise Exception(f"Invalid type annotation {v.annotation} for function {func.__name__}")
        
        res.append(
            FilterHandler(
                func=func,
                name=func.__name__,
                params=params_function,
                proto=proto
            )
        )
    
    for filter in filters:
        if not isinstance(filter, str):
            raise Exception("Invalid filter list: must be a list of strings")
        if filter in glob.keys():
            add_func_to_list(glob[filter])
        else:
            raise Exception(f"Filter {filter} not found")
    return res

def get_filters_info(code:str, proto:str) -> list[FilterHandler]:
    glob = {}
    exec("import firegex.nfproxy", glob, glob)
    exec("firegex.nfproxy.clear_pyfilter_registry()", glob, glob)
    exec(code, glob, glob)
    filters = eval("firegex.nfproxy.get_pyfilters()", glob, glob)
    try:
        return generate_filter_structure(filters, proto, glob)
    finally:
        exec("firegex.nfproxy.clear_pyfilter_registry()", glob, glob)
        

def get_filter_names(code:str, proto:str) -> list[str]:
    return [ele.name for ele in get_filters_info(code, proto)]    

def handle_packet(glob: dict) -> None:
    internal_data = DataStreamCtx(glob)
    
    cache_call = {} # Cache of the data handler calls
    cache_call[RawPacket] = internal_data.current_pkt
    
    final_result = Action.ACCEPT
    result = PacketHandlerResult(glob)
    
    func_name = None
    mangled_packet = None
    for filter in internal_data.filter_call_info:
        final_params = []
        skip_call = False
        for data_type, data_func in filter.params.items():
            if data_type not in cache_call.keys():
                try:
                    cache_call[data_type] = data_func(internal_data)
                except NotReadyToRun:
                    cache_call[data_type] = None
                    skip_call = True
                    break
                except StreamFullDrop:
                    result.action = Action.DROP
                    result.matched_by = "@MAX_STREAM_SIZE_REACHED"
                    return result.set_result()
                except StreamFullReject:
                    result.action = Action.REJECT
                    result.matched_by = "@MAX_STREAM_SIZE_REACHED"
                    return result.set_result()
                except DropPacket:
                    result.action = Action.DROP
                    result.matched_by = filter.name
                    return result.set_result()
                except RejectConnection:
                    result.action = Action.REJECT
                    result.matched_by = filter.name
                    return result.set_result()
            if cache_call[data_type] is None:
                skip_call = True
                break
            final_params.append(cache_call[data_type])
            
        if skip_call:
            continue
        
        res = context_call(glob, filter.func, *final_params)
        
        if res is None:
            continue #ACCEPTED
        if not isinstance(res, Action):
            raise Exception(f"Invalid return type {type(res)} for function {filter.name}")
        if res == Action.MANGLE:
            mangled_packet = internal_data.current_pkt.raw_packet
        if res != Action.ACCEPT:
            func_name = filter.name
            final_result = res
            break
    
    result.action = final_result
    result.matched_by = func_name
    result.mangled_packet = mangled_packet
    
    return result.set_result()


def compile(glob:dict) -> None:
    internal_data = DataStreamCtx(glob, init_pkt=False)

    glob["print"] = functools.partial(print, flush = True)
    
    filters = glob["__firegex_pyfilter_enabled"]
    proto = glob["__firegex_proto"]
    
    internal_data.filter_call_info = generate_filter_structure(filters, proto, glob)

    if "FGEX_STREAM_MAX_SIZE" in glob and int(glob["FGEX_STREAM_MAX_SIZE"]) > 0:
        internal_data.stream_max_size = int(glob["FGEX_STREAM_MAX_SIZE"])
    else:
        internal_data.stream_max_size = 1*8e20 # 1MB default value
    
    if "FGEX_FULL_STREAM_ACTION" in glob and isinstance(glob["FGEX_FULL_STREAM_ACTION"], FullStreamAction):
        internal_data.full_stream_action = glob["FGEX_FULL_STREAM_ACTION"]
    else:
        internal_data.full_stream_action = FullStreamAction.FLUSH
    
    PacketHandlerResult(glob).reset_result()

