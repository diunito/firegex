#include <linux/netfilter/nfnetlink_queue.h>
#include <libnetfilter_queue/libnetfilter_queue.h>
#include <linux/netfilter/nfnetlink_conntrack.h>
#include <tins/tins.h>
#include <tins/tcp_ip/stream_follower.h>
#include <libmnl/libmnl.h>
#include <linux/netfilter.h>
#include <linux/netfilter/nfnetlink.h>
#include <linux/types.h>
#include <stdexcept>
#include <thread>
#include <hs.h>
#include <iostream>

using Tins::TCPIP::Stream;
using Tins::TCPIP::StreamFollower;
using namespace std;


#ifndef NETFILTER_CLASSES_HPP
#define NETFILTER_CLASSES_HPP

string inline client_endpoint(const Stream& stream) {
    ostringstream output;
    // Use the IPv4 or IPv6 address depending on which protocol the 
    // connection uses
    if (stream.is_v6()) {
        output << stream.client_addr_v6();
    }
    else {
        output << stream.client_addr_v4();
    }
    output << ":" << stream.client_port();
    return output.str();
}

// Convert the server endpoint to a readable string
string inline server_endpoint(const Stream& stream) {
    ostringstream output;
    if (stream.is_v6()) {
        output << stream.server_addr_v6();
    }
    else {
        output << stream.server_addr_v4();
    }
    output << ":" << stream.server_port();
    return output.str();
}

// Concat both endpoints to get a readable stream identifier
string inline stream_identifier(const Stream& stream) {
    ostringstream output;
    output << client_endpoint(stream) << " - " << server_endpoint(stream);
    return output.str();
}

typedef unordered_map<string, hs_stream_t*> matching_map;

struct packet_info;

struct tcp_stream_tmp {
	bool matching_has_been_called = false;
	bool result;
	packet_info *pkt_info;
};

struct stream_ctx {
	matching_map in_hs_streams;
	matching_map out_hs_streams;
	hs_scratch_t* in_scratch = nullptr;
	hs_scratch_t* out_scratch = nullptr;
	u_int16_t latest_config_ver = 0;
	StreamFollower follower;
	mnl_socket* nl;
	tcp_stream_tmp tcp_match_util;

	void clean_scratches(){
		if (out_scratch != nullptr){
			hs_free_scratch(out_scratch);
			out_scratch = nullptr;
		}
		if (in_scratch != nullptr){
			hs_free_scratch(in_scratch);
			in_scratch = nullptr;
		}
	}
};

struct packet_info {
	string packet;
	string payload;
	string stream_id;
	bool is_input;
	bool is_tcp;
	stream_ctx* sctx;
};

typedef bool NetFilterQueueCallback(packet_info &);


Tins::PDU * find_transport_layer(Tins::PDU* pkt){
	while(pkt != nullptr){
		if (pkt->pdu_type() == Tins::PDU::TCP || pkt->pdu_type() == Tins::PDU::UDP) {
			return pkt;
		}
		pkt = pkt->inner_pdu();
	}
	return nullptr;
}

template <NetFilterQueueCallback callback_func>
class NetfilterQueue {
	public:

	size_t BUF_SIZE = 0xffff + (MNL_SOCKET_BUFFER_SIZE/2);
	char *buf = nullptr;
	unsigned int portid;
	u_int16_t queue_num;
	stream_ctx sctx;

	NetfilterQueue(u_int16_t queue_num): queue_num(queue_num) {
		sctx.nl = mnl_socket_open(NETLINK_NETFILTER);
		
		if (sctx.nl == nullptr) { throw runtime_error( "mnl_socket_open" );}

		if (mnl_socket_bind(sctx.nl, 0, MNL_SOCKET_AUTOPID) < 0) {
			mnl_socket_close(sctx.nl);
			throw runtime_error( "mnl_socket_bind" );
		}
		portid = mnl_socket_get_portid(sctx.nl);

		buf = (char*) malloc(BUF_SIZE);

		if (!buf) {
			mnl_socket_close(sctx.nl);
			throw runtime_error( "allocate receive buffer" );
		}

		if (send_config_cmd(NFQNL_CFG_CMD_BIND) < 0) {
			_clear();
			throw runtime_error( "mnl_socket_send" );
		}
		//TEST if BIND was successful
		if (send_config_cmd(NFQNL_CFG_CMD_NONE) < 0) { // SEND A NONE cmmand to generate an error meessage
			_clear();
			throw runtime_error( "mnl_socket_send" );
		}
		if (recv_packet() == -1) { //RECV the error message
			_clear();
			throw runtime_error( "mnl_socket_recvfrom" );
		}

		struct nlmsghdr *nlh = (struct nlmsghdr *) buf;
		
		if (nlh->nlmsg_type != NLMSG_ERROR) {
			_clear();
			throw runtime_error( "unexpected packet from kernel (expected NLMSG_ERROR packet)" );
		}		
		//nfqnl_msg_config_cmd
		nlmsgerr* error_msg = (nlmsgerr *)mnl_nlmsg_get_payload(nlh);	

		// error code taken from the linux kernel:
		// https://elixir.bootlin.com/linux/v5.18.12/source/include/linux/errno.h#L27
		#define ENOTSUPP	524	/* Operation is not supported */

		if (error_msg->error != -ENOTSUPP) {
			_clear();
			throw invalid_argument( "queueid is already busy" );
		}
		
		//END TESTING BIND
		nlh = nfq_nlmsg_put(buf, NFQNL_MSG_CONFIG, queue_num);
		nfq_nlmsg_cfg_put_params(nlh, NFQNL_COPY_PACKET, 0xffff);

		mnl_attr_put_u32(nlh, NFQA_CFG_FLAGS, htonl(NFQA_CFG_F_GSO));
		mnl_attr_put_u32(nlh, NFQA_CFG_MASK, htonl(NFQA_CFG_F_GSO));

		if (mnl_socket_sendto(sctx.nl, nlh, nlh->nlmsg_len) < 0) {
			_clear();
			throw runtime_error( "mnl_socket_send" );
		}

	}

	//Input data filtering
	void on_client_data(Stream& stream) {
		string data(stream.client_payload().begin(), stream.client_payload().end());
		string stream_id = stream_identifier(stream);
		this->sctx.tcp_match_util.pkt_info->is_input = true;
		this->sctx.tcp_match_util.pkt_info->stream_id = stream_id;
		this->sctx.tcp_match_util.matching_has_been_called = true;
		bool result = callback_func(*sctx.tcp_match_util.pkt_info);
		if (result){
			this->clean_stream_by_id(stream_id);
			stream.ignore_client_data();
			stream.ignore_server_data();
		}
		this->sctx.tcp_match_util.result = result;
	}

	//Server data filtering
	void on_server_data(Stream& stream) {
		string data(stream.server_payload().begin(), stream.server_payload().end());
		string stream_id = stream_identifier(stream);
		this->sctx.tcp_match_util.pkt_info->is_input = false;
		this->sctx.tcp_match_util.pkt_info->stream_id = stream_id;
		this->sctx.tcp_match_util.matching_has_been_called = true;
		bool result = callback_func(*sctx.tcp_match_util.pkt_info);
		if (result){
			this->clean_stream_by_id(stream_id);
			stream.ignore_client_data();
			stream.ignore_server_data();
		}
		this->sctx.tcp_match_util.result = result;
	}

	void on_new_stream(Stream& stream) {
		string stream_id = stream_identifier(stream);
		if (stream.is_partial_stream()) {
			return;
		}
		cout << "[+] New connection " << stream_id << endl;
		stream.auto_cleanup_payloads(true);
		stream.client_data_callback(
			[&](auto a){this->on_client_data(a);}
		);
		stream.server_data_callback(
			[&](auto a){this->on_server_data(a);}
		);
	}

	void clean_stream_by_id(string stream_id){
		auto stream_search = this->sctx.in_hs_streams.find(stream_id);
		hs_stream_t* stream_match;
		if (stream_search != this->sctx.in_hs_streams.end()){
			stream_match = stream_search->second;
			if (hs_close_stream(stream_match, sctx.in_scratch, nullptr, nullptr) != HS_SUCCESS) {
                cerr << "[error] [NetfilterQueue.clean_stream_by_id] Error closing the stream matcher (hs)" << endl;
                throw invalid_argument("Cannot close stream match on hyperscan");
            }
			this->sctx.in_hs_streams.erase(stream_search);
		}

		stream_search = this->sctx.out_hs_streams.find(stream_id);
		if (stream_search != this->sctx.out_hs_streams.end()){
			stream_match = stream_search->second;
			if (hs_close_stream(stream_match, sctx.out_scratch, nullptr, nullptr) != HS_SUCCESS) {
                cerr << "[error] [NetfilterQueue.clean_stream_by_id] Error closing the stream matcher (hs)" << endl;
                throw invalid_argument("Cannot close stream match on hyperscan");
            }
			this->sctx.out_hs_streams.erase(stream_search);
		}
	}

	// A stream was terminated. The second argument is the reason why it was terminated
	void on_stream_terminated(Stream& stream, StreamFollower::TerminationReason reason) {
		string stream_id = stream_identifier(stream);
		cout << "[+] Connection closed: " << stream_id << endl;
		this->clean_stream_by_id(stream_id);
	}


	void run(){
		/*
		* ENOBUFS is signalled to userspace when packets were lost
		* on kernel side.  In most cases, userspace isn't interested
		* in this information, so turn it off.
		*/
		int ret = 1;
		mnl_socket_setsockopt(sctx.nl, NETLINK_NO_ENOBUFS, &ret, sizeof(int));
		sctx.follower.new_stream_callback(
			[&](auto a){this->on_new_stream(a);}
		);
		sctx.follower.stream_termination_callback(
			[&](auto a, auto b){this->on_stream_terminated(a, b);}
		);
		for (;;) {
			ret = recv_packet();
			if (ret == -1) {
				throw runtime_error( "mnl_socket_recvfrom" );
			}
			
			ret = mnl_cb_run(buf, ret, 0, portid, queue_cb, &sctx);
			if (ret < 0){
				throw runtime_error( "mnl_cb_run" );
			}
		}
	}
	
	
	~NetfilterQueue() {
		send_config_cmd(NFQNL_CFG_CMD_UNBIND);
		_clear();
	}
	private:

	ssize_t send_config_cmd(nfqnl_msg_config_cmds cmd){
		struct nlmsghdr *nlh = nfq_nlmsg_put(buf, NFQNL_MSG_CONFIG, queue_num);
		nfq_nlmsg_cfg_put_cmd(nlh, AF_INET, cmd);
		return mnl_socket_sendto(sctx.nl, nlh, nlh->nlmsg_len);
	}

	ssize_t recv_packet(){
		return mnl_socket_recvfrom(sctx.nl, buf, BUF_SIZE);
	}	

	void _clear(){
		if (buf != nullptr) {
			free(buf);
			buf = nullptr;
		}
		mnl_socket_close(sctx.nl);
		sctx.nl = nullptr;
		sctx.clean_scratches();

		for(auto ele: sctx.in_hs_streams){
			if (hs_close_stream(ele.second, sctx.in_scratch, nullptr, nullptr) != HS_SUCCESS) {
				cerr << "[error] [NetfilterQueue.clean_stream_by_id] Error closing the stream matcher (hs)" << endl;
				throw invalid_argument("Cannot close stream match on hyperscan");
			}
		}
		sctx.in_hs_streams.clear();
		for(auto ele: sctx.out_hs_streams){
			if (hs_close_stream(ele.second, sctx.out_scratch, nullptr, nullptr) != HS_SUCCESS) {
				cerr << "[error] [NetfilterQueue.clean_stream_by_id] Error closing the stream matcher (hs)" << endl;
				throw invalid_argument("Cannot close stream match on hyperscan");
			}
		}
		sctx.out_hs_streams.clear();
	}

	static int queue_cb(const nlmsghdr *nlh, void *data_ptr)
	{
		stream_ctx* sctx = (stream_ctx*)data_ptr;

		//Extract attributes from the nlmsghdr
		nlattr *attr[NFQA_MAX+1] = {};
		
		if (nfq_nlmsg_parse(nlh, attr) < 0) {
			perror("problems parsing");
			return MNL_CB_ERROR;
		}
		if (attr[NFQA_PACKET_HDR] == nullptr) {
			fputs("metaheader not set\n", stderr);
			return MNL_CB_ERROR;
		}	
		//Get Payload
		uint16_t plen = mnl_attr_get_payload_len(attr[NFQA_PAYLOAD]);
		uint8_t *payload = (uint8_t *)mnl_attr_get_payload(attr[NFQA_PAYLOAD]);
		
		//Return result to the kernel
		struct nfqnl_msg_packet_hdr *ph = (nfqnl_msg_packet_hdr*) mnl_attr_get_payload(attr[NFQA_PACKET_HDR]);
		struct nfgenmsg *nfg = (nfgenmsg *)mnl_nlmsg_get_payload(nlh);
		char buf[MNL_SOCKET_BUFFER_SIZE];
		struct nlmsghdr *nlh_verdict;
		struct nlattr *nest;

		nlh_verdict = nfq_nlmsg_put(buf, NFQNL_MSG_VERDICT, ntohs(nfg->res_id));

		// Check IP protocol version
		Tins::PDU *packet;
		if ( ((payload)[0] & 0xf0) == 0x40 ){
			Tins::IP parsed = Tins::IP(payload, plen);
			packet = &parsed;
		}else{
			Tins::IPv6 parsed = Tins::IPv6(payload, plen);
			packet = &parsed;
		}
		Tins::PDU *transport_layer = find_transport_layer(packet); 
		if(transport_layer == nullptr || transport_layer->inner_pdu() == nullptr){ 						
			nfq_nlmsg_verdict_put(nlh_verdict, ntohl(ph->packet_id), NF_ACCEPT );
		}else{
			bool is_tcp = transport_layer->pdu_type() == Tins::PDU::TCP;
			int size = transport_layer->inner_pdu()->size();
			packet_info pktinfo{
				packet: string(payload, payload+plen),
				payload: string(payload+plen - size, payload+plen),
				stream_id: "", // TODO We need to calculate this
				is_input: true, // TODO We need to detect this
				is_tcp: is_tcp,
				sctx: sctx,
			};
			if (is_tcp){
				sctx->tcp_match_util.matching_has_been_called = false;
				sctx->tcp_match_util.pkt_info = &pktinfo;
				sctx->follower.process_packet(*packet);
				if (sctx->tcp_match_util.matching_has_been_called && !sctx->tcp_match_util.result){
					auto tcp_layer = (Tins::TCP *)transport_layer;
					tcp_layer->release_inner_pdu();
					tcp_layer->set_flag(Tins::TCP::FIN,1);
					tcp_layer->set_flag(Tins::TCP::ACK,1);
					tcp_layer->set_flag(Tins::TCP::SYN,0);
					nfq_nlmsg_verdict_put_pkt(nlh_verdict, packet->serialize().data(), packet->size());
					nfq_nlmsg_verdict_put(nlh_verdict, ntohl(ph->packet_id), NF_ACCEPT );
					delete tcp_layer;
				}
			}else if(callback_func(pktinfo)){
				nfq_nlmsg_verdict_put(nlh_verdict, ntohl(ph->packet_id), NF_ACCEPT );
			} else{
				nfq_nlmsg_verdict_put(nlh_verdict, ntohl(ph->packet_id), NF_DROP );
			}
		}

		/* example to set the connmark. First, start NFQA_CT section: */
		nest = mnl_attr_nest_start(nlh_verdict, NFQA_CT);

		/* then, add the connmark attribute: */
		mnl_attr_put_u32(nlh_verdict, CTA_MARK, htonl(42));
		/* more conntrack attributes, e.g. CTA_LABELS could be set here */

		/* end conntrack section */
		mnl_attr_nest_end(nlh_verdict, nest);

		if (mnl_socket_sendto(sctx->nl, nlh_verdict, nlh_verdict->nlmsg_len) < 0) {
			throw runtime_error( "mnl_socket_send" );
		}

		return MNL_CB_OK;
	}

};

template <NetFilterQueueCallback func>
class NFQueueSequence{
	private:
		vector<NetfilterQueue<func> *> nfq;
		uint16_t _init;
		uint16_t _end;
		vector<thread> threads;
	public:
		static const int QUEUE_BASE_NUM = 1000;

		NFQueueSequence(uint16_t seq_len){
			if (seq_len <= 0) throw invalid_argument("seq_len <= 0");
			nfq = vector<NetfilterQueue<func>*>(seq_len);
			_init = QUEUE_BASE_NUM;
			while(nfq[0] == nullptr){
				if (_init+seq_len-1 >= 65536){
					throw runtime_error("NFQueueSequence: too many queues!");
				}
				for (int i=0;i<seq_len;i++){
					try{
						nfq[i] = new NetfilterQueue<func>(_init+i);
					}catch(const invalid_argument e){
						for(int j = 0; j < i; j++) {
							delete nfq[j];
							nfq[j] = nullptr;
						}
						_init += seq_len - i;
						break;
					}
				}
			}
			_end = _init + seq_len - 1;
		}
		
		void start(){
			if (threads.size() != 0) throw runtime_error("NFQueueSequence: already started!");
			for (int i=0;i<nfq.size();i++){
				threads.push_back(thread(&NetfilterQueue<func>::run, nfq[i]));
			}
		}

		void join(){
			for (int i=0;i<nfq.size();i++){
				threads[i].join();
			}
			threads.clear();
		}

		uint16_t init(){
			return _init;
		}
		uint16_t end(){
			return _end;
		}
		
		~NFQueueSequence(){
			for (int i=0;i<nfq.size();i++){
				delete nfq[i];
			}
		}
};

#endif // NETFILTER_CLASSES_HPP